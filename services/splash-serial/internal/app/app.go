package app

import (
	"context"
	"fmt"
	"log"

	"gitea.rader.haus/devinrader/splash/services/splash-serial/internal/config"
	"gitea.rader.haus/devinrader/splash/services/splash-serial/internal/httpapi"
	"gitea.rader.haus/devinrader/splash/services/splash-serial/internal/nats"
	"gitea.rader.haus/devinrader/splash/services/splash-serial/internal/serial"
)

type App struct {
	cfg          config.Config
	logger       *log.Logger
	natsClient   *nats.Client
	serialPort   *serial.Port
	healthServer *httpapi.Server
}

func New() (*App, error) {
	cfg, err := config.LoadFromEnv()
	if err != nil {
		return nil, err
	}

	logger := log.Default()
	natsClient := nats.NewClient(cfg.NATSURL)
	serialPort := serial.NewPort(cfg.SerialDevice)

	healthState := httpapi.HealthState{
		Status:          httpapi.StatusDegraded,
		StreamID:        "",
		SerialDevice:    cfg.SerialDevice,
		ConnectionState: string(serial.StateConnecting),
		NATS:            httpapi.DependencyUnknown,
		Configuration:   httpapi.ConfigurationValid,
	}

	server := httpapi.NewServer(cfg.SerialHTTPBind, healthState)

	return &App{
		cfg:          cfg,
		logger:       logger,
		natsClient:   natsClient,
		serialPort:   serialPort,
		healthServer: server,
	}, nil
}

func (a *App) Run(ctx context.Context) error {
	a.logger.Printf("starting splash-serial on %s", a.cfg.SerialHTTPBind)
	a.logger.Printf("configured serial device %s", a.serialPort.Device())
	a.logger.Printf("configured NATS target %s", a.natsClient.URL())

	errCh := make(chan error, 1)
	go func() {
		errCh <- a.healthServer.Run(ctx)
	}()

	select {
	case <-ctx.Done():
		a.logger.Print("shutting down splash-serial")
		return nil
	case err := <-errCh:
		if err != nil {
			return fmt.Errorf("health server: %w", err)
		}
		return nil
	}
}
