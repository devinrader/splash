package app

import (
	"context"
	"errors"
	"io"
	"log"
	"strings"
	"testing"
	"time"

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
		natsClient:    nats.NewClient("nats://splash-core.local:4222"),
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
		natsClient:    nats.NewClient("nats://splash-core.local:4222"),
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
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	cancel()
	<-errCh
	t.Fatal("session loop did not reach connected state")
}

type appFactory struct {
	open func(device string) (serial.Port, error)
}

func (f appFactory) Open(device string) (serial.Port, error) {
	return f.open(device)
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
