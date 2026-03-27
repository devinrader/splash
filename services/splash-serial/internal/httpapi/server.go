package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"
)

type Status string

const (
	StatusOK       Status = "ok"
	StatusDegraded Status = "degraded"
	StatusError    Status = "error"
)

type DependencyState string

const (
	DependencyOK      DependencyState = "ok"
	DependencyUnknown DependencyState = "unknown"
)

type ConfigurationState string

const (
	ConfigurationValid ConfigurationState = "valid"
)

type HealthState struct {
	Status          Status             `json:"status"`
	StreamID        string             `json:"stream_id"`
	SerialDevice    string             `json:"serial_device"`
	ConnectionState string             `json:"connection_state"`
	NATS            DependencyState    `json:"nats"`
	Configuration   ConfigurationState `json:"configuration"`
}

type Server struct {
	addr   string
	health HealthState
}

func NewServer(addr string, health HealthState) *Server {
	return &Server{
		addr:   addr,
		health: health,
	}
}

func (s *Server) Run(ctx context.Context) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.handleHealthz)
	mux.HandleFunc("/metrics", s.handleMetrics)

	server := &http.Server{
		Addr:              s.addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	err := server.ListenAndServe()
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	statusCode := http.StatusOK
	if s.health.Status == StatusError {
		statusCode = http.StatusServiceUnavailable
	}

	writeJSON(w, statusCode, s.health)
}

func (s *Server) handleMetrics(w http.ResponseWriter, _ *http.Request) {
	body := fmt.Sprintf(
		"# HELP splash_serial_connection_state Current connection state gauge.\n"+
			"# TYPE splash_serial_connection_state gauge\n"+
			"splash_serial_connection_state{state=%q} 0\n"+
			"# HELP splash_serial_reconnect_total Total reconnect attempts.\n"+
			"# TYPE splash_serial_reconnect_total counter\n"+
			"splash_serial_reconnect_total 0\n"+
			"# HELP splash_serial_bytes_read_total Total serial bytes read.\n"+
			"# TYPE splash_serial_bytes_read_total counter\n"+
			"splash_serial_bytes_read_total 0\n"+
			"# HELP splash_serial_bytes_written_total Total serial bytes written.\n"+
			"# TYPE splash_serial_bytes_written_total counter\n"+
			"splash_serial_bytes_written_total 0\n"+
			"# HELP splash_serial_write_failures_total Total failed writes.\n"+
			"# TYPE splash_serial_write_failures_total counter\n"+
			"splash_serial_write_failures_total{write_result=%q} 0\n"+
			"# HELP splash_serial_stream_age_seconds Current active stream age.\n"+
			"# TYPE splash_serial_stream_age_seconds gauge\n"+
			"splash_serial_stream_age_seconds 0\n",
		s.health.ConnectionState,
		"rejected",
	)

	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(body))
}

func writeJSON(w http.ResponseWriter, statusCode int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(value)
}
