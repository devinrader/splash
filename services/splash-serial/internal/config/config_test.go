package config

import (
	"testing"
	"time"
)

func TestLoadFromEnv(t *testing.T) {
	t.Setenv("NATS_URL", "nats://splash-core.local:4222")
	t.Setenv("SERIAL_DEVICE", "/dev/ttyUSB0")
	t.Setenv("SERIAL_RECONNECT_INTERVAL_MS", "10000")
	t.Setenv("SERIAL_WRITE_TIMEOUT_MS", "2000")
	t.Setenv("SERIAL_HTTP_BIND", "127.0.0.1:9108")
	t.Setenv("SERIAL_DEFAULT_IDLE_MS", "50")
	t.Setenv("LOG_LEVEL", "")
	t.Setenv("TZ", "America/New_York")

	cfg, err := LoadFromEnv()
	if err != nil {
		t.Fatalf("LoadFromEnv returned error: %v", err)
	}

	if cfg.NATSURL != "nats://splash-core.local:4222" {
		t.Fatalf("unexpected NATSURL: %q", cfg.NATSURL)
	}

	if cfg.SerialReconnectInterval != 10*time.Second {
		t.Fatalf("unexpected SerialReconnectInterval: %v", cfg.SerialReconnectInterval)
	}

	if cfg.SerialWriteTimeout != 2*time.Second {
		t.Fatalf("unexpected SerialWriteTimeout: %v", cfg.SerialWriteTimeout)
	}

	if cfg.SerialDefaultIdle != 50*time.Millisecond {
		t.Fatalf("unexpected SerialDefaultIdle: %v", cfg.SerialDefaultIdle)
	}

	if cfg.LogLevel != "info" {
		t.Fatalf("unexpected LogLevel: %q", cfg.LogLevel)
	}
}

func TestLoadFromEnvRequiresValidBind(t *testing.T) {
	t.Setenv("NATS_URL", "nats://splash-core.local:4222")
	t.Setenv("SERIAL_DEVICE", "/dev/ttyUSB0")
	t.Setenv("SERIAL_RECONNECT_INTERVAL_MS", "10000")
	t.Setenv("SERIAL_WRITE_TIMEOUT_MS", "2000")
	t.Setenv("SERIAL_HTTP_BIND", "not-a-bind")
	t.Setenv("SERIAL_DEFAULT_IDLE_MS", "50")

	_, err := LoadFromEnv()
	if err == nil {
		t.Fatal("expected validation error")
	}
}

func TestLoadFromEnvRequiresNATSURL(t *testing.T) {
	t.Setenv("SERIAL_DEVICE", "/dev/ttyUSB0")
	t.Setenv("SERIAL_RECONNECT_INTERVAL_MS", "10000")
	t.Setenv("SERIAL_WRITE_TIMEOUT_MS", "2000")
	t.Setenv("SERIAL_HTTP_BIND", "127.0.0.1:9108")
	t.Setenv("SERIAL_DEFAULT_IDLE_MS", "50")

	_, err := LoadFromEnv()
	if err == nil {
		t.Fatal("expected validation error")
	}
}

func TestLoadFromEnvRejectsZeroReconnectInterval(t *testing.T) {
	t.Setenv("NATS_URL", "nats://splash-core.local:4222")
	t.Setenv("SERIAL_DEVICE", "/dev/ttyUSB0")
	t.Setenv("SERIAL_RECONNECT_INTERVAL_MS", "0")
	t.Setenv("SERIAL_WRITE_TIMEOUT_MS", "2000")
	t.Setenv("SERIAL_HTTP_BIND", "127.0.0.1:9108")
	t.Setenv("SERIAL_DEFAULT_IDLE_MS", "50")

	_, err := LoadFromEnv()
	if err == nil {
		t.Fatal("expected duration validation error")
	}
}

func TestLoadFromEnvAllowsZeroDefaultIdle(t *testing.T) {
	t.Setenv("NATS_URL", "nats://splash-core.local:4222")
	t.Setenv("SERIAL_DEVICE", "/dev/ttyUSB0")
	t.Setenv("SERIAL_RECONNECT_INTERVAL_MS", "10000")
	t.Setenv("SERIAL_WRITE_TIMEOUT_MS", "2000")
	t.Setenv("SERIAL_HTTP_BIND", "127.0.0.1:9108")
	t.Setenv("SERIAL_DEFAULT_IDLE_MS", "0")

	cfg, err := LoadFromEnv()
	if err != nil {
		t.Fatalf("LoadFromEnv returned error: %v", err)
	}

	if cfg.SerialDefaultIdle != 0 {
		t.Fatalf("expected zero default idle, got %v", cfg.SerialDefaultIdle)
	}
}
