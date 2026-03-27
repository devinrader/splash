package app

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"strings"
	"testing"
	"time"

	"gitea.rader.haus/devinrader/splash/services/splash-serial/internal/config"
	"gitea.rader.haus/devinrader/splash/services/splash-serial/internal/httpapi"
	"gitea.rader.haus/devinrader/splash/services/splash-serial/internal/nats"
	"gitea.rader.haus/devinrader/splash/services/splash-serial/internal/serial"
)

func TestNewBuildsApplicationFromEnv(t *testing.T) {
	t.Setenv("NATS_URL", "nats://splash-core.local:4222")
	t.Setenv("SERIAL_DEVICE", "/dev/ttyUSB0")
	t.Setenv("SERIAL_RECONNECT_INTERVAL_MS", "10000")
	t.Setenv("SERIAL_WRITE_TIMEOUT_MS", "2000")
	t.Setenv("SERIAL_HTTP_BIND", "127.0.0.1:9108")
	t.Setenv("SERIAL_DEFAULT_IDLE_MS", "50")
	t.Setenv("LOG_LEVEL", "info")
	t.Setenv("TZ", "America/New_York")

	app, err := New()
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}

	if app.cfg.NATSURL != "nats://splash-core.local:4222" {
		t.Fatalf("unexpected NATS URL: %q", app.cfg.NATSURL)
	}

	if app.serialManager.Device() != "/dev/ttyUSB0" {
		t.Fatalf("unexpected serial device: %q", app.serialManager.Device())
	}

	if app.natsClient.URL() != "nats://splash-core.local:4222" {
		t.Fatalf("unexpected client URL: %q", app.natsClient.URL())
	}

	if app.logger == nil {
		t.Fatal("expected logger to be initialized")
	}
}

func TestRunWrapsHealthServerErrors(t *testing.T) {
	app := &App{
		logger:        log.New(io.Discard, "", 0),
		natsClient:    nats.NewClient("nats://splash-core.local:4222", time.Second),
		serialManager: serial.NewManager("/dev/ttyUSB0", 10, serial.NewUnsupportedFactory()),
		healthServer:  httpapi.NewServer("bad-bind", httpapi.HealthState{}),
		after: func(time.Duration) <-chan time.Time {
			ch := make(chan time.Time)
			return ch
		},
	}

	err := app.Run(context.Background())
	if err == nil {
		t.Fatal("expected Run to return an error")
	}

	if !strings.Contains(err.Error(), "listen") {
		t.Fatalf("expected health server listen error, got %v", err)
	}
}

func TestRunSessionLoopRetriesAndUpdatesHealth(t *testing.T) {
	retry := make(chan time.Time, 1)
	attempts := 0

	manager := serial.NewManager("/dev/ttyUSB0", 10*time.Millisecond, appFactory{
		open: func(string) (serial.Port, error) {
			attempts++
			if attempts == 1 {
				return nil, errors.New("adapter unavailable")
			}
			return &blockingAppPort{device: "/dev/ttyUSB0"}, nil
		},
	})

	app := &App{
		logger:        log.New(io.Discard, "", 0),
		natsClient:    nats.NewClient("nats://splash-core.local:4222", time.Second),
		serialManager: manager,
		healthServer:  httpapi.NewServer("127.0.0.1:9108", httpapi.HealthState{}),
		after: func(time.Duration) <-chan time.Time {
			return retry
		},
	}

	ctx, cancel := context.WithCancel(context.Background())
	errCh := make(chan error, 1)

	go func() {
		errCh <- app.runSessionLoop(ctx)
	}()

	retry <- time.Now()

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		health := app.healthServer.Health()
		if health.StreamID != "" && health.ConnectionState == string(serial.StateConnected) {
			cancel()

			if err := <-errCh; err != nil {
				t.Fatalf("runSessionLoop returned error: %v", err)
			}

			finalHealth := app.healthServer.Health()
			if finalHealth.ConnectionState != string(serial.StateDisconnected) {
				t.Fatalf("expected disconnected health after cancel, got %q", finalHealth.ConnectionState)
			}

			metrics := app.healthServer.Metrics()
			if metrics.ReconnectTotal != 1 {
				t.Fatalf("expected reconnect count 1, got %d", metrics.ReconnectTotal)
			}

			published := app.natsClient.PublishedMessages()
			if len(published) == 0 {
				t.Fatal("expected published status messages")
			}
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	cancel()
	<-errCh
	t.Fatal("session loop did not reach connected state")
}

func TestReadLoopPublishesNativeReadBoundary(t *testing.T) {
	manager := serial.NewManager("/dev/ttyUSB0", 10*time.Millisecond, appFactory{
		open: func(string) (serial.Port, error) {
			return &scriptedAppPort{
				device: "/dev/ttyUSB0",
				reads: []appReadResult{
					{data: []byte{0x01, 0x02, 0x03}},
					{err: io.EOF},
				},
			}, nil
		},
	})

	session, err := manager.Connect()
	if err != nil {
		t.Fatalf("Connect returned error: %v", err)
	}

	app := &App{
		logger:        log.New(io.Discard, "", 0),
		natsClient:    nats.NewClient("nats://splash-core.local:4222", time.Second),
		serialManager: manager,
		healthServer:  httpapi.NewServer("127.0.0.1:9108", httpapi.HealthState{}),
	}

	err = app.readLoop(context.Background(), session)
	if !errors.Is(err, io.EOF) {
		t.Fatalf("expected EOF from readLoop, got %v", err)
	}

	published := app.natsClient.PublishedMessages()
	if len(published) != 1 {
		t.Fatalf("expected 1 rx message, got %d", len(published))
	}

	if app.healthServer.Metrics().BytesReadTotal != 3 {
		t.Fatalf("expected bytes read metric 3, got %d", app.healthServer.Metrics().BytesReadTotal)
	}

	if published[0].Subject != nats.SubjectSerialRXRaw {
		t.Fatalf("unexpected subject: %q", published[0].Subject)
	}

	var payload nats.SerialRXRaw
	if err := json.Unmarshal(published[0].Data, &payload); err != nil {
		t.Fatalf("Unmarshal returned error: %v", err)
	}

	if payload.BytesHex != "010203" {
		t.Fatalf("expected native read boundary bytes, got %q", payload.BytesHex)
	}
}

func TestHandleWriteRequestPublishesStaleStreamResult(t *testing.T) {
	app := &App{
		cfg: config.Config{
			SerialWriteTimeout: time.Second,
		},
		logger:        log.New(io.Discard, "", 0),
		natsClient:    nats.NewClient("nats://splash-core.local:4222", time.Second),
		serialManager: serial.NewManager("/dev/ttyUSB0", time.Second, nil),
		healthServer:  httpapi.NewServer("127.0.0.1:9108", httpapi.HealthState{}),
	}

	err := app.handleWriteRequest(nats.SerialWriteRequest{
		StreamID:  "stream-1",
		CommandID: "command-1",
		BytesHex:  "0102",
		ByteCount: 2,
	})
	if err != nil {
		t.Fatalf("handleWriteRequest returned error: %v", err)
	}

	published := app.natsClient.PublishedMessages()
	if len(published) != 1 {
		t.Fatalf("expected 1 tx message, got %d", len(published))
	}

	var payload nats.SerialTXRaw
	if err := json.Unmarshal(published[0].Data, &payload); err != nil {
		t.Fatalf("Unmarshal returned error: %v", err)
	}

	if payload.WriteResult != string(serial.WriteResultStaleStream) {
		t.Fatalf("expected stale_stream, got %q", payload.WriteResult)
	}

	if app.healthServer.Metrics().WriteFailures[string(serial.WriteResultStaleStream)] != 1 {
		t.Fatalf("expected stale_stream failure metric 1, got %d", app.healthServer.Metrics().WriteFailures[string(serial.WriteResultStaleStream)])
	}
}

func TestHandleWriteRequestRejectsInvalidHex(t *testing.T) {
	app := &App{
		cfg: config.Config{
			SerialWriteTimeout: time.Second,
		},
		logger:        log.New(io.Discard, "", 0),
		natsClient:    nats.NewClient("nats://splash-core.local:4222", time.Second),
		serialManager: serial.NewManager("/dev/ttyUSB0", time.Second, nil),
		healthServer:  httpapi.NewServer("127.0.0.1:9108", httpapi.HealthState{}),
	}

	err := app.handleWriteRequest(nats.SerialWriteRequest{
		StreamID:  "stream-1",
		CommandID: "command-1",
		BytesHex:  "not-hex",
	})
	if err != nil {
		t.Fatalf("handleWriteRequest returned error: %v", err)
	}

	published := app.natsClient.PublishedMessages()
	if len(published) != 1 {
		t.Fatalf("expected 1 tx message, got %d", len(published))
	}

	var payload nats.SerialTXRaw
	if err := json.Unmarshal(published[0].Data, &payload); err != nil {
		t.Fatalf("Unmarshal returned error: %v", err)
	}

	if payload.WriteResult != string(serial.WriteResultRejected) {
		t.Fatalf("expected rejected, got %q", payload.WriteResult)
	}

	if app.healthServer.Metrics().WriteFailures[string(serial.WriteResultRejected)] != 1 {
		t.Fatalf("expected rejected failure metric 1, got %d", app.healthServer.Metrics().WriteFailures[string(serial.WriteResultRejected)])
	}
}

func TestSetNATSStateMarksHealthySerialSessionDegraded(t *testing.T) {
	app := &App{
		logger:        log.New(io.Discard, "", 0),
		natsClient:    nats.NewClient("nats://splash-core.local:4222", time.Second),
		serialManager: serial.NewManager("/dev/ttyUSB0", time.Second, serial.NewUnsupportedFactory()),
		healthServer: httpapi.NewServer("127.0.0.1:9108", httpapi.HealthState{
			Status:          httpapi.StatusOK,
			StreamID:        "stream-1",
			SerialDevice:    "/dev/ttyUSB0",
			ConnectionState: string(serial.StateConnected),
			NATS:            httpapi.DependencyUnknown,
			Configuration:   httpapi.ConfigurationValid,
		}),
		serialStatus: httpapi.StatusOK,
		natsState:    httpapi.DependencyUnknown,
	}

	app.setNATSState(httpapi.DependencyError)

	health := app.healthServer.Health()
	if health.Status != httpapi.StatusDegraded {
		t.Fatalf("expected degraded health, got %q", health.Status)
	}

	if health.NATS != httpapi.DependencyError {
		t.Fatalf("expected NATS error state, got %q", health.NATS)
	}
}

func TestSetNATSStateMarksHealthySerialSessionOK(t *testing.T) {
	app := &App{
		logger:        log.New(io.Discard, "", 0),
		natsClient:    nats.NewClient("nats://splash-core.local:4222", time.Second),
		serialManager: serial.NewManager("/dev/ttyUSB0", time.Second, serial.NewUnsupportedFactory()),
		healthServer: httpapi.NewServer("127.0.0.1:9108", httpapi.HealthState{
			Status:          httpapi.StatusDegraded,
			StreamID:        "stream-1",
			SerialDevice:    "/dev/ttyUSB0",
			ConnectionState: string(serial.StateConnected),
			NATS:            httpapi.DependencyUnknown,
			Configuration:   httpapi.ConfigurationValid,
		}),
		serialStatus: httpapi.StatusOK,
		natsState:    httpapi.DependencyUnknown,
	}

	app.setNATSState(httpapi.DependencyOK)

	health := app.healthServer.Health()
	if health.Status != httpapi.StatusOK {
		t.Fatalf("expected ok health, got %q", health.Status)
	}

	if health.NATS != httpapi.DependencyOK {
		t.Fatalf("expected NATS ok state, got %q", health.NATS)
	}
}

type appFactory struct {
	open func(device string) (serial.Port, error)
}

func (f appFactory) Open(device string) (serial.Port, error) {
	return f.open(device)
}

type scriptedAppPort struct {
	device string
	reads  []appReadResult
}

type appReadResult struct {
	data []byte
	err  error
}

func (p *scriptedAppPort) Device() string {
	return p.device
}

func (p *scriptedAppPort) Read(buf []byte) (int, error) {
	if len(p.reads) == 0 {
		return 0, io.EOF
	}

	result := p.reads[0]
	p.reads = p.reads[1:]
	copy(buf, result.data)
	return len(result.data), result.err
}

func (p *scriptedAppPort) Write(data []byte) (int, error) {
	return len(data), nil
}

func (p *scriptedAppPort) Close() error {
	return nil
}

type blockingAppPort struct {
	device string
}

func (p *blockingAppPort) Device() string {
	return p.device
}

func (p *blockingAppPort) Read([]byte) (int, error) {
	time.Sleep(10 * time.Millisecond)
	return 0, nil
}

func (p *blockingAppPort) Write(data []byte) (int, error) {
	return len(data), nil
}

func (p *blockingAppPort) Close() error {
	return nil
}
