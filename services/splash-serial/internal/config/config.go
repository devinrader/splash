package config

import (
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"time"
)

const defaultLogLevel = "info"
const defaultSerialInstanceIDFile = "/var/lib/splash/splash-serial/instance-id"

type Config struct {
	NATSURL                 string
	SerialDevice            string
	SerialReconnectInterval time.Duration
	SerialWriteTimeout      time.Duration
	SerialHTTPBind          string
	SerialDefaultIdle       time.Duration
	SerialInstanceIDFile    string
	LogLevel                string
	Timezone                string
}

func LoadFromEnv() (Config, error) {
	cfg := Config{
		NATSURL:              strings.TrimSpace(os.Getenv("NATS_URL")),
		SerialDevice:         strings.TrimSpace(os.Getenv("SERIAL_DEVICE")),
		SerialHTTPBind:       strings.TrimSpace(os.Getenv("SERIAL_HTTP_BIND")),
		SerialInstanceIDFile: strings.TrimSpace(os.Getenv("SERIAL_INSTANCE_ID_FILE")),
		LogLevel:             strings.TrimSpace(os.Getenv("LOG_LEVEL")),
		Timezone:             strings.TrimSpace(os.Getenv("TZ")),
	}

	if cfg.LogLevel == "" {
		cfg.LogLevel = defaultLogLevel
	}

	if cfg.SerialInstanceIDFile == "" {
		cfg.SerialInstanceIDFile = defaultSerialInstanceIDFile
	}

	var err error
	cfg.SerialReconnectInterval, err = loadRequiredDurationMS("SERIAL_RECONNECT_INTERVAL_MS", false)
	if err != nil {
		return Config{}, err
	}

	cfg.SerialWriteTimeout, err = loadRequiredDurationMS("SERIAL_WRITE_TIMEOUT_MS", false)
	if err != nil {
		return Config{}, err
	}

	cfg.SerialDefaultIdle, err = loadRequiredDurationMS("SERIAL_DEFAULT_IDLE_MS", true)
	if err != nil {
		return Config{}, err
	}

	if err := validate(cfg); err != nil {
		return Config{}, err
	}

	return cfg, nil
}

func loadRequiredDurationMS(name string, allowZero bool) (time.Duration, error) {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return 0, fmt.Errorf("%s is required", name)
	}

	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("%s must be a valid integer: %w", name, err)
	}

	if value < 0 || (!allowZero && value == 0) {
		comparison := "greater than 0"
		if allowZero {
			comparison = "greater than or equal to 0"
		}
		return 0, fmt.Errorf("%s must be %s", name, comparison)
	}

	return time.Duration(value) * time.Millisecond, nil
}

func validate(cfg Config) error {
	if cfg.NATSURL == "" {
		return fmt.Errorf("NATS_URL is required")
	}

	if cfg.SerialDevice == "" {
		return fmt.Errorf("SERIAL_DEVICE is required")
	}

	if cfg.SerialHTTPBind == "" {
		return fmt.Errorf("SERIAL_HTTP_BIND is required")
	}

	if cfg.SerialInstanceIDFile == "" {
		return fmt.Errorf("SERIAL_INSTANCE_ID_FILE resolved to an empty path")
	}

	if _, err := net.ResolveTCPAddr("tcp", cfg.SerialHTTPBind); err != nil {
		return fmt.Errorf("SERIAL_HTTP_BIND must be a valid host:port bind target: %w", err)
	}

	return nil
}
