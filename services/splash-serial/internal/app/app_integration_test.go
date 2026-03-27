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
	"testing"
	"time"

	"github.com/creack/pty"

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

func reserveLoopbackAddress(t *testing.T) string {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("reserve loopback address: %v", err)
	}
	defer listener.Close()

	return listener.Addr().String()
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
