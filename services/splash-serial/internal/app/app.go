package app

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"sync"
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
	healthMu      sync.RWMutex
	serialStatus  httpapi.Status
	natsState     httpapi.DependencyState
}

func New() (*App, error) {
	cfg, err := config.LoadFromEnv()
	if err != nil {
		return nil, err
	}

	logger := log.Default()
	natsClient := nats.NewClient(cfg.NATSURL, cfg.SerialReconnectInterval)
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
		serialStatus:  httpapi.StatusDegraded,
		natsState:     httpapi.DependencyUnknown,
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
	go func() {
		errCh <- a.runWriteLoop(ctx)
	}()
	go a.runNATSLoop(ctx)

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

func (a *App) runWriteLoop(ctx context.Context) error {
	return a.natsClient.SubscribeSerialWriteRequests(ctx, func(request nats.SerialWriteRequest) error {
		return a.handleWriteRequest(request)
	})
}

func (a *App) runNATSLoop(ctx context.Context) {
	for {
		if err := a.natsClient.Connect(); err == nil {
			a.setNATSState(httpapi.DependencyOK)
			if a.watchNATS(ctx) {
				return
			}
			continue
		} else {
			a.logger.Printf("nats connect failed for %s: %v", a.natsClient.URL(), err)
			a.setNATSState(httpapi.DependencyError)
		}

		select {
		case <-ctx.Done():
			return
		case <-a.after(a.serialManager.ReconnectInterval()):
		}
	}
}

func (a *App) watchNATS(ctx context.Context) bool {
	for {
		select {
		case <-ctx.Done():
			a.natsClient.Close()
			return true
		case status := <-a.natsClient.StatusChanges():
			switch status {
			case nats.ConnectionStatusConnected:
				a.logger.Printf("nats connected: %s", a.natsClient.URL())
				a.setNATSState(httpapi.DependencyOK)
			case nats.ConnectionStatusDisconnected, nats.ConnectionStatusReconnecting:
				a.logger.Printf("nats unavailable: %s status=%s", a.natsClient.URL(), status)
				a.setNATSState(httpapi.DependencyError)
			case nats.ConnectionStatusClosed:
				a.logger.Printf("nats connection closed: %s", a.natsClient.URL())
				a.setNATSState(httpapi.DependencyError)
				a.natsClient.Close()
				select {
				case <-ctx.Done():
					return true
				case <-a.after(a.serialManager.ReconnectInterval()):
					return false
				}
			}
		}
	}
}

func (a *App) runSessionLoop(ctx context.Context) error {
	firstAttempt := true

	for {
		if !firstAttempt {
			a.healthServer.RecordReconnect()
		}
		firstAttempt = false

		if err := a.publishStatus("", serial.StateConnecting, "attempting adapter connection"); err != nil {
			return fmt.Errorf("publish connecting status: %w", err)
		}
		session, err := a.serialManager.Connect()
		if err != nil {
			a.logger.Printf("serial connect failed for %s: %v", a.serialManager.Device(), err)
			a.setHealth(httpapi.StatusError, "")
			if publishErr := a.publishStatus("", serial.StateError, err.Error()); publishErr != nil {
				return fmt.Errorf("publish error status: %w", publishErr)
			}

			select {
			case <-ctx.Done():
				return nil
			case <-a.after(a.serialManager.ReconnectInterval()):
				continue
			}
		}

		a.logger.Printf("serial session connected: stream_id=%s device=%s", session.StreamID, session.Device)
		a.setHealth(httpapi.StatusOK, session.StreamID)
		a.healthServer.SetConnectedStream(string(serial.StateConnected), session.ConnectedAt)
		if err := a.publishStatus(session.StreamID, serial.StateConnected, "adapter connected"); err != nil {
			return fmt.Errorf("publish connected status: %w", err)
		}

		if err := a.readLoop(ctx, session); err != nil {
			if errors.Is(err, io.EOF) {
				a.logger.Printf("serial session ended: stream_id=%s device=%s", session.StreamID, session.Device)
				if disconnectErr := a.serialManager.Disconnect(serial.StateDisconnected); disconnectErr != nil {
					return fmt.Errorf("disconnect ended serial session: %w", disconnectErr)
				}
				a.setHealth(httpapi.StatusDegraded, "")
				if publishErr := a.publishStatus("", serial.StateDisconnected, "adapter read ended"); publishErr != nil {
					return fmt.Errorf("publish disconnected status: %w", publishErr)
				}
				select {
				case <-ctx.Done():
					return nil
				case <-a.after(a.serialManager.ReconnectInterval()):
					continue
				}
			}
			return err
		}

		<-ctx.Done()

		if err := a.serialManager.Disconnect(serial.StateDisconnected); err != nil {
			return fmt.Errorf("disconnect serial session: %w", err)
		}

		a.setHealth(httpapi.StatusDegraded, "")
		if err := a.publishStatus("", serial.StateDisconnected, "shutting down"); err != nil {
			return fmt.Errorf("publish shutdown status: %w", err)
		}
		return nil
	}
}

func (a *App) readLoop(ctx context.Context, session *serial.Session) error {
	buf := make([]byte, 1024)

	for {
		select {
		case <-ctx.Done():
			return nil
		default:
		}

		n, err := a.serialManager.Read(buf)
		if n > 0 {
			a.healthServer.AddBytesRead(n)
			if publishErr := a.natsClient.PublishSerialRXRaw(nats.SerialRXRaw{
				StreamID:   session.StreamID,
				ChunkID:    a.chunkID(),
				Port:       session.Device,
				ReceivedAt: time.Now().UTC(),
				BytesHex:   hex.EncodeToString(buf[:n]),
				ByteCount:  n,
			}); publishErr != nil {
				return fmt.Errorf("publish serial rx: %w", publishErr)
			}
		}

		if err != nil {
			return err
		}
	}
}

func (a *App) setHealth(status httpapi.Status, streamID string) {
	a.healthMu.Lock()
	a.serialStatus = status
	natsState := a.natsState
	a.healthMu.Unlock()

	a.healthServer.UpdateHealth(httpapi.HealthState{
		Status:          a.overallStatus(status, natsState),
		StreamID:        streamID,
		SerialDevice:    a.serialManager.Device(),
		ConnectionState: string(a.serialManager.State()),
		NATS:            natsState,
		Configuration:   httpapi.ConfigurationValid,
	})
}

func (a *App) setNATSState(state httpapi.DependencyState) {
	a.healthMu.Lock()
	a.natsState = state
	serialStatus := a.serialStatus
	a.healthMu.Unlock()

	current := a.healthServer.Health()
	current.Status = a.overallStatus(serialStatus, state)
	current.NATS = state
	a.healthServer.UpdateHealth(current)
}

func (a *App) handleWriteRequest(request nats.SerialWriteRequest) error {
	payload, err := hex.DecodeString(request.BytesHex)
	if err != nil {
		a.healthServer.ObserveWrite(string(serial.WriteResultRejected), request.ByteCount)
		code := "invalid_bytes_hex"
		detail := "write request bytes_hex is not valid lowercase hex"
		return a.natsClient.PublishSerialTXRaw(nats.SerialTXRaw{
			StreamID:    request.StreamID,
			CommandID:   request.CommandID,
			WrittenAt:   time.Now().UTC(),
			BytesHex:    request.BytesHex,
			ByteCount:   request.ByteCount,
			WriteResult: string(serial.WriteResultRejected),
			ErrorCode:   &code,
			Detail:      &detail,
		})
	}

	outcome := a.serialManager.Write(
		request.StreamID,
		payload,
		a.cfg.SerialWriteTimeout,
		time.Duration(request.BusRequirements.RequiresIdleMS)*time.Millisecond,
	)
	a.healthServer.ObserveWrite(string(outcome.WriteResult), outcome.ByteCount)

	return a.natsClient.PublishSerialTXRaw(nats.SerialTXRaw{
		StreamID:    outcome.StreamID,
		CommandID:   request.CommandID,
		WrittenAt:   time.Now().UTC(),
		BytesHex:    request.BytesHex,
		ByteCount:   outcome.ByteCount,
		WriteResult: string(outcome.WriteResult),
		ErrorCode:   outcome.ErrorCode,
		Detail:      outcome.Detail,
	})
}

func (a *App) publishStatus(streamID string, state serial.ConnectionState, detail string) error {
	return a.natsClient.PublishSerialPortStatus(nats.SerialPortStatus{
		StreamID:   streamID,
		Status:     string(state),
		Port:       a.serialManager.Device(),
		ReportedAt: time.Now().UTC(),
		Detail:     detail,
	})
}

func (a *App) chunkID() string {
	return fmt.Sprintf("chunk-%d", time.Now().UnixNano())
}

func (a *App) overallStatus(serialStatus httpapi.Status, natsState httpapi.DependencyState) httpapi.Status {
	if serialStatus == httpapi.StatusError {
		return httpapi.StatusError
	}

	if serialStatus == httpapi.StatusOK && natsState == httpapi.DependencyOK {
		return httpapi.StatusOK
	}

	return httpapi.StatusDegraded
}
