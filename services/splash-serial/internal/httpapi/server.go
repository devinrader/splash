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

type MetricsState struct {
	ConnectionState   string
	ReconnectTotal    uint64
	BytesReadTotal    uint64
	BytesWrittenTotal uint64
	WriteFailures     map[string]uint64
	StreamConnectedAt time.Time
}

type Server struct {
	addr    string
	mu      sync.RWMutex
	health  HealthState
	metrics MetricsState
	now     func() time.Time
}

func NewServer(addr string, health HealthState) *Server {
	metrics := MetricsState{
		ConnectionState: health.ConnectionState,
		WriteFailures: map[string]uint64{
			"rejected":     0,
			"stale_stream": 0,
			"timeout":      0,
			"port_error":   0,
		},
	}

	return &Server{
		addr:    addr,
		health:  health,
		metrics: metrics,
		now:     time.Now,
	}
}

func (s *Server) UpdateHealth(health HealthState) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.health = health
	s.metrics.ConnectionState = health.ConnectionState
	if health.StreamID == "" {
		s.metrics.StreamConnectedAt = time.Time{}
	}
}

func (s *Server) Health() HealthState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.health
}

func (s *Server) Metrics() MetricsState {
	s.mu.RLock()
	defer s.mu.RUnlock()

	failures := make(map[string]uint64, len(s.metrics.WriteFailures))
	for key, value := range s.metrics.WriteFailures {
		failures[key] = value
	}

	return MetricsState{
		ConnectionState:   s.metrics.ConnectionState,
		ReconnectTotal:    s.metrics.ReconnectTotal,
		BytesReadTotal:    s.metrics.BytesReadTotal,
		BytesWrittenTotal: s.metrics.BytesWrittenTotal,
		WriteFailures:     failures,
		StreamConnectedAt: s.metrics.StreamConnectedAt,
	}
}

func (s *Server) SetConnectedStream(state string, connectedAt time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.metrics.ConnectionState = state
	s.metrics.StreamConnectedAt = connectedAt
}

func (s *Server) RecordReconnect() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.metrics.ReconnectTotal++
}

func (s *Server) AddBytesRead(count int) {
	if count <= 0 {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.metrics.BytesReadTotal += uint64(count)
}

func (s *Server) ObserveWrite(writeResult string, byteCount int) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if writeResult == "ok" {
		if byteCount > 0 {
			s.metrics.BytesWrittenTotal += uint64(byteCount)
		}
		return
	}

	s.metrics.WriteFailures[writeResult]++
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
	metrics := s.Metrics()
	streamAge := 0.0
	if !metrics.StreamConnectedAt.IsZero() {
		streamAge = s.now().Sub(metrics.StreamConnectedAt).Seconds()
		if streamAge < 0 {
			streamAge = 0
		}
	}

	connectionStates := []string{"connecting", "connected", "disconnected", "error", "write_blocked"}
	connectionMetrics := ""
	for _, state := range connectionStates {
		value := 0
		if metrics.ConnectionState == state {
			value = 1
		}
		connectionMetrics += fmt.Sprintf("splash_serial_connection_state{state=%q} %d\n", state, value)
	}
	if metrics.ConnectionState != "" && !contains(connectionStates, metrics.ConnectionState) {
		connectionMetrics += fmt.Sprintf("splash_serial_connection_state{state=%q} 1\n", metrics.ConnectionState)
	}

	failureResults := []string{"port_error", "rejected", "stale_stream", "timeout"}
	writeFailureMetrics := ""
	for _, result := range failureResults {
		writeFailureMetrics += fmt.Sprintf(
			"splash_serial_write_failures_total{write_result=%q} %d\n",
			result,
			metrics.WriteFailures[result],
		)
	}

	body := fmt.Sprintf(
		"# HELP splash_serial_connection_state Current connection state gauge.\n"+
			"# TYPE splash_serial_connection_state gauge\n"+
			"%s"+
			"# HELP splash_serial_reconnect_total Total reconnect attempts.\n"+
			"# TYPE splash_serial_reconnect_total counter\n"+
			"splash_serial_reconnect_total %d\n"+
			"# HELP splash_serial_bytes_read_total Total serial bytes read.\n"+
			"# TYPE splash_serial_bytes_read_total counter\n"+
			"splash_serial_bytes_read_total %d\n"+
			"# HELP splash_serial_bytes_written_total Total serial bytes written.\n"+
			"# TYPE splash_serial_bytes_written_total counter\n"+
			"splash_serial_bytes_written_total %d\n"+
			"# HELP splash_serial_write_failures_total Total failed writes.\n"+
			"# TYPE splash_serial_write_failures_total counter\n"+
			"%s"+
			"# HELP splash_serial_stream_age_seconds Current active stream age.\n"+
			"# TYPE splash_serial_stream_age_seconds gauge\n"+
			"splash_serial_stream_age_seconds %.6f\n",
		connectionMetrics,
		metrics.ReconnectTotal,
		metrics.BytesReadTotal,
		metrics.BytesWrittenTotal,
		writeFailureMetrics,
		streamAge,
	)

	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(body))
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func writeJSON(w http.ResponseWriter, statusCode int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(value)
}
