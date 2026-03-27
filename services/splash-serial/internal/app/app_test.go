package app

import (
	"context"
	"io"
	"log"
	"strings"
	"testing"

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

	if app.serialPort.Device() != "/dev/ttyUSB0" {
		t.Fatalf("unexpected serial device: %q", app.serialPort.Device())
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
		logger:       log.New(io.Discard, "", 0),
		natsClient:   nats.NewClient("nats://splash-core.local:4222"),
		serialPort:   serial.NewPort("/dev/ttyUSB0"),
		healthServer: httpapi.NewServer("bad-bind", httpapi.HealthState{}),
	}

	err := app.Run(context.Background())
	if err == nil {
		t.Fatal("expected Run to return an error")
	}

	if !strings.Contains(err.Error(), "health server") {
		t.Fatalf("expected wrapped health server error, got %v", err)
	}
}
