//go:build integration

package app

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/creack/pty"
	natsserver "github.com/nats-io/nats-server/v2/server"
	gnats "github.com/nats-io/nats.go"

	"gitea.rader.haus/devinrader/splash/services/splash-serial/internal/config"
	"gitea.rader.haus/devinrader/splash/services/splash-serial/internal/httpapi"
	"gitea.rader.haus/devinrader/splash/services/splash-serial/internal/nats"
	"gitea.rader.haus/devinrader/splash/services/splash-serial/internal/serial"
)

func TestIntegrationAppPublishesPTYReadAndWriteTraffic(t *testing.T) {
	master, slave, err := pty.Open()
	if err != nil {
		t.Fatalf("open pty: %v", err)
	}
	defer master.Close()
	defer slave.Close()

	setPTYRaw(t, slave.Name())

	httpAddr := reserveLoopbackAddress(t)

	app := &App{
		cfg: config.Config{
			SerialDevice:            slave.Name(),
			SerialReconnectInterval: 10 * time.Millisecond,
			SerialWriteTimeout:      time.Second,
			SerialHTTPBind:          httpAddr,
		},
		logger:        log.New(io.Discard, "", 0),
		natsClient:    nats.NewClient("nats://integration.local:4222"),
		serialManager: serial.NewManager(slave.Name(), 10*time.Millisecond, serial.NewOSFactory()),
		healthServer: httpapi.NewServer(httpAddr, httpapi.HealthState{
			Status:          httpapi.StatusDegraded,
			SerialDevice:    slave.Name(),
			ConnectionState: string(serial.StateDisconnected),
			NATS:            httpapi.DependencyUnknown,
			Configuration:   httpapi.ConfigurationValid,
		}),
		after: time.After,
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	errCh := make(chan error, 1)
	go func() {
		errCh <- app.Run(ctx)
	}()

	connected := waitForMessage(t, app.natsClient, nats.SubjectSerialPortStatus, func(data []byte) bool {
		var payload nats.SerialPortStatus
		if err := json.Unmarshal(data, &payload); err != nil {
			return false
		}
		return payload.Status == string(serial.StateConnected) && payload.StreamID != ""
	})

	var status nats.SerialPortStatus
	if err := json.Unmarshal(connected.Data, &status); err != nil {
		t.Fatalf("decode connected status: %v", err)
	}

	if _, err := master.Write([]byte{0x10, 0x20, 0x30}); err != nil {
		t.Fatalf("write pty master: %v", err)
	}

	rx := waitForMessage(t, app.natsClient, nats.SubjectSerialRXRaw, func(data []byte) bool {
		var payload nats.SerialRXRaw
		if err := json.Unmarshal(data, &payload); err != nil {
			return false
		}
		return payload.StreamID == status.StreamID && payload.BytesHex == "102030"
	})

	var rxPayload nats.SerialRXRaw
	if err := json.Unmarshal(rx.Data, &rxPayload); err != nil {
		t.Fatalf("decode serial rx: %v", err)
	}

	if rxPayload.Port != slave.Name() {
		t.Fatalf("expected rx port %q, got %q", slave.Name(), rxPayload.Port)
	}

	writeRead := make(chan []byte, 1)
	go func() {
		buf := make([]byte, 16)
		n, err := master.Read(buf)
		if err != nil {
			writeRead <- nil
			return
		}
		writeRead <- append([]byte(nil), buf[:n]...)
	}()

	app.natsClient.DeliverSerialWriteRequest(nats.SerialWriteRequest{
		StreamID:     status.StreamID,
		CommandID:    "command-1",
		RequestedAt:  time.Now().UTC(),
		ProtocolName: "integration-test",
		BytesHex:     "a1b2",
		ByteCount:    2,
	})

	tx := waitForMessage(t, app.natsClient, nats.SubjectSerialTXRaw, func(data []byte) bool {
		var payload nats.SerialTXRaw
		if err := json.Unmarshal(data, &payload); err != nil {
			return false
		}
		return payload.CommandID == "command-1" && payload.WriteResult == string(serial.WriteResultOK)
	})

	var txPayload nats.SerialTXRaw
	if err := json.Unmarshal(tx.Data, &txPayload); err != nil {
		t.Fatalf("decode serial tx: %v", err)
	}

	if txPayload.StreamID != status.StreamID {
		t.Fatalf("expected tx stream %q, got %q", status.StreamID, txPayload.StreamID)
	}

	select {
	case got := <-writeRead:
		if len(got) != 2 || got[0] != 0xa1 || got[1] != 0xb2 {
			t.Fatalf("unexpected bytes written to PTY master: %x", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for PTY write")
	}

	assertHealthz(t, httpAddr, status.StreamID)
	assertMetricsContains(t, httpAddr, []string{
		"splash_serial_connection_state{state=\"connected\"} 1",
		"splash_serial_bytes_read_total 3",
		"splash_serial_bytes_written_total 2",
		"splash_serial_write_failures_total{write_result=\"rejected\"} 0",
	})

	cancel()

	select {
	case err := <-errCh:
		if err != nil {
			t.Fatalf("app exited with error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for app shutdown")
	}
}

func TestIntegrationNewLoadsConfiguredPTYDevice(t *testing.T) {
	master, slave, err := pty.Open()
	if err != nil {
		t.Fatalf("open pty: %v", err)
	}
	defer master.Close()
	defer slave.Close()

	setPTYRaw(t, slave.Name())

	httpAddr := reserveLoopbackAddress(t)

	t.Setenv("NATS_URL", "nats://integration.local:4222")
	t.Setenv("SERIAL_DEVICE", slave.Name())
	t.Setenv("SERIAL_RECONNECT_INTERVAL_MS", "10")
	t.Setenv("SERIAL_WRITE_TIMEOUT_MS", "1000")
	t.Setenv("SERIAL_HTTP_BIND", httpAddr)
	t.Setenv("SERIAL_DEFAULT_IDLE_MS", "50")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("TZ", "America/New_York")

	app, err := New()
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}

	if app.serialManager.Device() != slave.Name() {
		t.Fatalf("expected device %q, got %q", slave.Name(), app.serialManager.Device())
	}

	if app.cfg.SerialHTTPBind != httpAddr {
		t.Fatalf("expected bind %q, got %q", httpAddr, app.cfg.SerialHTTPBind)
	}
}

func TestIntegrationAppRejectsInvalidHexWriteRequest(t *testing.T) {
	master, slave, err := pty.Open()
	if err != nil {
		t.Fatalf("open pty: %v", err)
	}
	defer master.Close()
	defer slave.Close()

	setPTYRaw(t, slave.Name())

	httpAddr := reserveLoopbackAddress(t)

	app := &App{
		cfg: config.Config{
			SerialDevice:            slave.Name(),
			SerialReconnectInterval: 10 * time.Millisecond,
			SerialWriteTimeout:      time.Second,
			SerialHTTPBind:          httpAddr,
		},
		logger:        log.New(io.Discard, "", 0),
		natsClient:    nats.NewClient("nats://integration.local:4222"),
		serialManager: serial.NewManager(slave.Name(), 10*time.Millisecond, serial.NewOSFactory()),
		healthServer: httpapi.NewServer(httpAddr, httpapi.HealthState{
			Status:          httpapi.StatusDegraded,
			SerialDevice:    slave.Name(),
			ConnectionState: string(serial.StateDisconnected),
			NATS:            httpapi.DependencyUnknown,
			Configuration:   httpapi.ConfigurationValid,
		}),
		after: time.After,
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	errCh := make(chan error, 1)
	go func() {
		errCh <- app.Run(ctx)
	}()

	connected := waitForMessage(t, app.natsClient, nats.SubjectSerialPortStatus, func(data []byte) bool {
		var payload nats.SerialPortStatus
		if err := json.Unmarshal(data, &payload); err != nil {
			return false
		}
		return payload.Status == string(serial.StateConnected) && payload.StreamID != ""
	})

	var status nats.SerialPortStatus
	if err := json.Unmarshal(connected.Data, &status); err != nil {
		t.Fatalf("decode connected status: %v", err)
	}

	app.natsClient.DeliverSerialWriteRequest(nats.SerialWriteRequest{
		StreamID:     status.StreamID,
		CommandID:    "command-invalid",
		RequestedAt:  time.Now().UTC(),
		ProtocolName: "integration-test",
		BytesHex:     "not-hex",
		ByteCount:    3,
	})

	tx := waitForMessage(t, app.natsClient, nats.SubjectSerialTXRaw, func(data []byte) bool {
		var payload nats.SerialTXRaw
		if err := json.Unmarshal(data, &payload); err != nil {
			return false
		}
		return payload.CommandID == "command-invalid" && payload.WriteResult == string(serial.WriteResultRejected)
	})

	var txPayload nats.SerialTXRaw
	if err := json.Unmarshal(tx.Data, &txPayload); err != nil {
		t.Fatalf("decode rejected serial tx: %v", err)
	}

	if txPayload.ErrorCode == nil || *txPayload.ErrorCode != "invalid_bytes_hex" {
		t.Fatalf("expected invalid_bytes_hex error code, got %+v", txPayload.ErrorCode)
	}

	assertMetricsContains(t, httpAddr, []string{
		"splash_serial_write_failures_total{write_result=\"rejected\"} 1",
		"splash_serial_bytes_written_total 0",
	})

	cancel()

	select {
	case err := <-errCh:
		if err != nil {
			t.Fatalf("app exited with error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for app shutdown")
	}
}

func TestIntegrationAppReportsErrorWhenDeviceUnavailable(t *testing.T) {
	httpAddr := reserveLoopbackAddress(t)

	app := &App{
		cfg: config.Config{
			SerialDevice:            "/tmp/splash-serial-missing-device",
			SerialReconnectInterval: 10 * time.Millisecond,
			SerialWriteTimeout:      time.Second,
			SerialHTTPBind:          httpAddr,
		},
		logger:        log.New(io.Discard, "", 0),
		natsClient:    nats.NewClient("nats://integration.local:4222"),
		serialManager: serial.NewManager("/tmp/splash-serial-missing-device", 10*time.Millisecond, serial.NewOSFactory()),
		healthServer: httpapi.NewServer(httpAddr, httpapi.HealthState{
			Status:          httpapi.StatusDegraded,
			SerialDevice:    "/tmp/splash-serial-missing-device",
			ConnectionState: string(serial.StateDisconnected),
			NATS:            httpapi.DependencyUnknown,
			Configuration:   httpapi.ConfigurationValid,
		}),
		after: time.After,
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	errCh := make(chan error, 1)
	go func() {
		errCh <- app.Run(ctx)
	}()

	statusMessage := waitForMessage(t, app.natsClient, nats.SubjectSerialPortStatus, func(data []byte) bool {
		var payload nats.SerialPortStatus
		if err := json.Unmarshal(data, &payload); err != nil {
			return false
		}
		return payload.Status == string(serial.StateError)
	})

	var status nats.SerialPortStatus
	if err := json.Unmarshal(statusMessage.Data, &status); err != nil {
		t.Fatalf("decode error status: %v", err)
	}

	if status.StreamID != "" {
		t.Fatalf("expected empty stream id for failed connect, got %q", status.StreamID)
	}

	assertHealthStatus(t, httpAddr, httpapi.StatusError, "")

	cancel()

	select {
	case err := <-errCh:
		if err != nil {
			t.Fatalf("app exited with error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for app shutdown")
	}
}

func TestIntegrationAppUsesRealNATSBus(t *testing.T) {
	server, url := startTestNATSServer(t)
	defer server.Shutdown()

	master, slave, err := pty.Open()
	if err != nil {
		t.Fatalf("open pty: %v", err)
	}
	defer master.Close()
	defer slave.Close()

	setPTYRaw(t, slave.Name())

	httpAddr := reserveLoopbackAddress(t)

	app := &App{
		cfg: config.Config{
			SerialDevice:            slave.Name(),
			SerialReconnectInterval: 10 * time.Millisecond,
			SerialWriteTimeout:      time.Second,
			SerialHTTPBind:          httpAddr,
		},
		logger:        log.New(io.Discard, "", 0),
		natsClient:    nats.NewClient(url),
		serialManager: serial.NewManager(slave.Name(), 10*time.Millisecond, serial.NewOSFactory()),
		healthServer: httpapi.NewServer(httpAddr, httpapi.HealthState{
			Status:          httpapi.StatusDegraded,
			SerialDevice:    slave.Name(),
			ConnectionState: string(serial.StateDisconnected),
			NATS:            httpapi.DependencyUnknown,
			Configuration:   httpapi.ConfigurationValid,
		}),
		after:        time.After,
		serialStatus: httpapi.StatusDegraded,
		natsState:    httpapi.DependencyUnknown,
	}

	bus, err := gnats.Connect(url)
	if err != nil {
		t.Fatalf("connect test subscriber: %v", err)
	}
	defer bus.Close()

	statusCh := make(chan nats.SerialPortStatus, 8)
	rxCh := make(chan nats.SerialRXRaw, 8)
	txCh := make(chan nats.SerialTXRaw, 8)

	mustSubscribeJSON[nats.SerialPortStatus](t, bus, nats.SubjectSerialPortStatus, statusCh)
	mustSubscribeJSON[nats.SerialRXRaw](t, bus, nats.SubjectSerialRXRaw, rxCh)
	mustSubscribeJSON[nats.SerialTXRaw](t, bus, nats.SubjectSerialTXRaw, txCh)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	errCh := make(chan error, 1)
	go func() {
		errCh <- app.Run(ctx)
	}()

	waitForCondition(t, 3*time.Second, func() bool {
		return app.natsClient.Connected()
	})

	waitForCondition(t, 3*time.Second, func() bool {
		health := app.healthServer.Health()
		return health.StreamID != "" && health.ConnectionState == string(serial.StateConnected) && health.NATS == httpapi.DependencyOK
	})

	connectedHealth := app.healthServer.Health()
	connectedStreamID := connectedHealth.StreamID

	if _, err := master.Write([]byte{0x44, 0x55, 0x66}); err != nil {
		t.Fatalf("write pty master: %v", err)
	}

	waitForDecoded(t, rxCh, func(payload nats.SerialRXRaw) bool {
		return payload.StreamID == connectedStreamID && payload.BytesHex == "445566"
	})

	writeRead := make(chan []byte, 1)
	go func() {
		buf := make([]byte, 16)
		n, err := master.Read(buf)
		if err != nil {
			writeRead <- nil
			return
		}
		writeRead <- append([]byte(nil), buf[:n]...)
	}()

	request := nats.SerialWriteRequest{
		StreamID:     connectedStreamID,
		CommandID:    "command-bus",
		RequestedAt:  time.Now().UTC(),
		ProtocolName: "integration-test",
		BytesHex:     "dead",
		ByteCount:    2,
	}
	requestData, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("marshal write request: %v", err)
	}

	if err := bus.Publish(nats.SubjectSerialWriteRequest, requestData); err != nil {
		t.Fatalf("publish write request: %v", err)
	}
	if err := bus.Flush(); err != nil {
		t.Fatalf("flush write request: %v", err)
	}

	waitForDecoded(t, txCh, func(payload nats.SerialTXRaw) bool {
		return payload.CommandID == "command-bus" && payload.WriteResult == string(serial.WriteResultOK)
	})

	select {
	case got := <-writeRead:
		if len(got) != 2 || got[0] != 0xde || got[1] != 0xad {
			t.Fatalf("unexpected bytes written to PTY master: %x", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for PTY write from real bus request")
	}

	assertHealthStatus(t, httpAddr, httpapi.StatusOK, connectedStreamID)

	if err := master.Close(); err != nil {
		t.Fatalf("close pty master: %v", err)
	}

	waitForDecoded(t, statusCh, func(payload nats.SerialPortStatus) bool {
		return payload.Status == string(serial.StateDisconnected)
	})

	cancel()

	select {
	case err := <-errCh:
		if err != nil {
			t.Fatalf("app exited with error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for app shutdown")
	}
}

func reserveLoopbackAddress(t *testing.T) string {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("reserve loopback address: %v", err)
	}
	defer listener.Close()

	return listener.Addr().String()
}

func assertMetricsContains(t *testing.T, addr string, required []string) {
	t.Helper()

	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://" + addr + "/metrics")
	if err != nil {
		t.Fatalf("get /metrics: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read /metrics: %v", err)
	}

	metrics := string(body)
	for _, want := range required {
		if !strings.Contains(metrics, want) {
			t.Fatalf("expected metrics to contain %q, body=%q", want, metrics)
		}
	}
}

func startTestNATSServer(t *testing.T) (*natsserver.Server, string) {
	t.Helper()

	opts := &natsserver.Options{
		Host: "127.0.0.1",
		Port: -1,
	}

	server, err := natsserver.NewServer(opts)
	if err != nil {
		t.Fatalf("new NATS server: %v", err)
	}

	go server.Start()

	if !server.ReadyForConnections(5 * time.Second) {
		server.Shutdown()
		t.Fatal("timed out waiting for NATS server readiness")
	}

	return server, server.ClientURL()
}

func setPTYRaw(t *testing.T, path string) {
	t.Helper()

	flag := "-F"
	if runtime.GOOS == "darwin" {
		flag = "-f"
	}

	cmd := exec.Command("stty", flag, path, "raw", "-echo")
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("configure PTY raw mode: %v (%s)", err, string(output))
	}
}

func mustSubscribeJSON[T any](t *testing.T, bus *gnats.Conn, subject string, out chan<- T) {
	t.Helper()

	_, err := bus.Subscribe(subject, func(msg *gnats.Msg) {
		var payload T
		if err := json.Unmarshal(msg.Data, &payload); err == nil {
			out <- payload
		}
	})
	if err != nil {
		t.Fatalf("subscribe %s: %v", subject, err)
	}

	if err := bus.Flush(); err != nil {
		t.Fatalf("flush subscribe %s: %v", subject, err)
	}
}

func waitForDecoded[T any](t *testing.T, ch <-chan T, match func(T) bool) {
	t.Helper()

	timeout := time.After(3 * time.Second)
	for {
		select {
		case payload := <-ch:
			if match(payload) {
				return
			}
		case <-timeout:
			t.Fatal("timed out waiting for decoded message")
		}
	}
}

func waitForCondition(t *testing.T, timeout time.Duration, condition func() bool) {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatal("timed out waiting for condition")
}

func waitForMessage(t *testing.T, client *nats.Client, subject string, match func([]byte) bool) nats.PublishedMessage {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		for _, message := range client.PublishedMessages() {
			if message.Subject == subject && match(message.Data) {
				return message
			}
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatalf("timed out waiting for subject %q", subject)
	return nats.PublishedMessage{}
}

func assertHealthz(t *testing.T, addr string, streamID string) {
	t.Helper()

	client := &http.Client{Timeout: 2 * time.Second}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		resp, err := client.Get("http://" + addr + "/healthz")
		if err == nil {
			defer resp.Body.Close()

			var health httpapi.HealthState
			if err := json.NewDecoder(resp.Body).Decode(&health); err == nil && health.StreamID == streamID {
				return
			}
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatalf("timed out waiting for /healthz to report stream %q", streamID)
}

func assertHealthStatus(t *testing.T, addr string, status httpapi.Status, streamID string) {
	t.Helper()

	client := &http.Client{Timeout: 2 * time.Second}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		resp, err := client.Get("http://" + addr + "/healthz")
		if err == nil {
			defer resp.Body.Close()

			var health httpapi.HealthState
			if err := json.NewDecoder(resp.Body).Decode(&health); err == nil && health.Status == status && health.StreamID == streamID {
				return
			}
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatalf("timed out waiting for /healthz status=%q stream=%q", status, streamID)
}
