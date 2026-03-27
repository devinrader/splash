package app

import (
	"context"
	"fmt"
	"log"
	"time"

	"gitea.rader.haus/devinrader/splash/services/splash-serial/internal/config"
	"gitea.rader.haus/devinrader/splash/services/splash-serial/internal/httpapi"
	"gitea.rader.haus/devinrader/splash/services/splash-serial/internal/nats"
	"gitea.rader.haus/devinrader/splash/services/splash-serial/internal/serial"
)

type App struct {
	cfg           config.Config
	logger        *log.Logger
	natsClient    *nats.Client
	serialManager *serial.Manager
	healthServer  *httpapi.Server
	after         func(time.Duration) <-chan time.Time
}

func New() (*App, error) {
	cfg, err := config.LoadFromEnv()
	if err != nil {
		return nil, err
	}

	logger := log.Default()
	natsClient := nats.NewClient(cfg.NATSURL)
	serialManager := serial.NewManager(
		cfg.SerialDevice,
		cfg.SerialReconnectInterval,
		serial.NewOSFactory(),
	)

	healthState := httpapi.HealthState{
		Status:          httpapi.StatusDegraded,
		StreamID:        "",
		SerialDevice:    serialManager.Device(),
		ConnectionState: string(serialManager.State()),
		NATS:            httpapi.DependencyUnknown,
		Configuration:   httpapi.ConfigurationValid,
	}

	server := httpapi.NewServer(cfg.SerialHTTPBind, healthState)

	return &App{
		cfg:           cfg,
		logger:        logger,
		natsClient:    natsClient,
		serialManager: serialManager,
		healthServer:  server,
		after:         time.After,
	}, nil
}

func (a *App) Run(ctx context.Context) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	a.logger.Printf("starting splash-serial on %s", a.cfg.SerialHTTPBind)
	a.logger.Printf("configured serial device %s", a.serialManager.Device())
	a.logger.Printf("configured NATS target %s", a.natsClient.URL())
	a.logger.Printf("configured reconnect interval %s", a.serialManager.ReconnectInterval())

	errCh := make(chan error, 2)
	go func() {
		errCh <- a.healthServer.Run(ctx)
	}()
	go func() {
		errCh <- a.runSessionLoop(ctx)
	}()

	select {
	case <-ctx.Done():
		a.logger.Print("shutting down splash-serial")
		return nil
	case err := <-errCh:
		if err != nil {
			cancel()
			return err
		}
		return nil
	}
}

func (a *App) runSessionLoop(ctx context.Context) error {
	for {
		session, err := a.serialManager.Connect()
		if err != nil {
			a.logger.Printf("serial connect failed for %s: %v", a.serialManager.Device(), err)
			a.setHealth(httpapi.StatusError, "")

			select {
			case <-ctx.Done():
				return nil
			case <-a.after(a.serialManager.ReconnectInterval()):
				continue
			}
		}

		a.logger.Printf("serial session connected: stream_id=%s device=%s", session.StreamID, session.Device)
		a.setHealth(httpapi.StatusDegraded, session.StreamID)

		<-ctx.Done()

		if err := a.serialManager.Disconnect(serial.StateDisconnected); err != nil {
			return fmt.Errorf("disconnect serial session: %w", err)
		}

		a.setHealth(httpapi.StatusDegraded, "")
		return nil
	}
}

func (a *App) setHealth(status httpapi.Status, streamID string) {
	a.healthServer.UpdateHealth(httpapi.HealthState{
		Status:          status,
		StreamID:        streamID,
		SerialDevice:    a.serialManager.Device(),
		ConnectionState: string(a.serialManager.State()),
		NATS:            httpapi.DependencyUnknown,
		Configuration:   httpapi.ConfigurationValid,
	})
}
