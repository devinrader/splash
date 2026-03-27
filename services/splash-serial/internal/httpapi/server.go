package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"
)

var listen = net.Listen

type Status string

const (
	StatusOK       Status = "ok"
	StatusDegraded Status = "degraded"
	StatusError    Status = "error"
)

type DependencyState string

const (
	DependencyOK      DependencyState = "ok"
	DependencyError   DependencyState = "error"
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
	mu     sync.RWMutex
	health HealthState
}

func NewServer(addr string, health HealthState) *Server {
	return &Server{
		addr:   addr,
		health: health,
	}
}

func (s *Server) UpdateHealth(health HealthState) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.health = health
}

func (s *Server) Health() HealthState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.health
}

func (s *Server) Run(ctx context.Context) error {
	listener, err := listen("tcp", s.addr)
	if err != nil {
		return err
	}

	return s.serve(ctx, listener)
}

func (s *Server) serve(ctx context.Context, listener net.Listener) error {
	server := &http.Server{
		Addr:              listener.Addr().String(),
		Handler:           s.handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	err := server.Serve(listener)
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func (s *Server) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.handleHealthz)
	mux.HandleFunc("/metrics", s.handleMetrics)
	return mux
}

func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	health := s.Health()
	statusCode := http.StatusOK
	if health.Status == StatusError {
		statusCode = http.StatusServiceUnavailable
	}

	writeJSON(w, statusCode, health)
}

func (s *Server) handleMetrics(w http.ResponseWriter, _ *http.Request) {
	health := s.Health()
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
		health.ConnectionState,
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
