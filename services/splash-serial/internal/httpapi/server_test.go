package httpapi

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHandleHealthzReturnsLivenessPayload(t *testing.T) {
	server := NewServer("127.0.0.1:9108", HealthState{
		Status:          StatusDegraded,
		StreamID:        "stream-1",
		SerialDevice:    "/dev/ttyUSB0",
		ConnectionState: "connected",
		NATS:            DependencyOK,
		Configuration:   ConfigurationValid,
	})

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()

	server.handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	var got map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if got["status"] != "healthy" {
		t.Fatalf("expected healthy liveness status, got %v", got["status"])
	}

	if got["message"] != "Process alive" {
		t.Fatalf("expected process alive message, got %v", got["message"])
	}
}

func TestHandleReadyzReturnsServiceUnavailableForError(t *testing.T) {
	server := NewServer("127.0.0.1:9108", HealthState{
		Status:          StatusError,
		SerialDevice:    "/dev/ttyUSB0",
		ConnectionState: "error",
		NATS:            DependencyUnknown,
		Configuration:   ConfigurationValid,
	})

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()

	server.handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status %d, got %d", http.StatusServiceUnavailable, rec.Code)
	}
}

func TestHandleHealthReturnsSemanticServiceState(t *testing.T) {
	server := NewServer("127.0.0.1:9108", HealthState{
		Status:          StatusDegraded,
		StreamID:        "stream-1",
		SerialDevice:    "/dev/ttyUSB0",
		ConnectionState: "connected",
		NATS:            DependencyError,
		Configuration:   ConfigurationValid,
	})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()

	server.handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	var got map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if got["status"] != "degraded" {
		t.Fatalf("expected degraded status, got %v", got["status"])
	}

	if got["stream_id"] != "stream-1" {
		t.Fatalf("expected stream_id stream-1, got %v", got["stream_id"])
	}

	checks, ok := got["checks"].(map[string]any)
	if !ok {
		t.Fatalf("expected checks object, got %T", got["checks"])
	}

	natsCheck, ok := checks["nats"].(map[string]any)
	if !ok {
		t.Fatalf("expected nats check object, got %T", checks["nats"])
	}

	if natsCheck["status"] != "unhealthy" {
		t.Fatalf("expected nats unhealthy status, got %v", natsCheck["status"])
	}
}

func TestHandleMetricsIncludesExpectedMetricNames(t *testing.T) {
	server := NewServer("127.0.0.1:9108", HealthState{
		Status:          StatusOK,
		SerialDevice:    "/dev/ttyUSB0",
		ConnectionState: "write_blocked",
		NATS:            DependencyOK,
		Configuration:   ConfigurationValid,
	})
	server.now = func() time.Time {
		return time.Unix(200, 0)
	}
	server.RecordReconnect()
	server.AddBytesRead(7)
	server.ObserveWrite("ok", 5)
	server.ObserveWrite("rejected", 3)
	server.SetConnectedStream("write_blocked", time.Unix(197, 0))

	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rec := httptest.NewRecorder()

	server.handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	body := rec.Body.String()
	required := []string{
		"splash_serial_connection_state{state=\"write_blocked\"} 1",
		"splash_serial_connection_state{state=\"connected\"} 0",
		"splash_serial_reconnect_total 1",
		"splash_serial_rx_messages_total 1",
		"splash_serial_tx_messages_total 2",
		"splash_serial_bytes_read_total 7",
		"splash_serial_bytes_written_total 5",
		"splash_serial_write_failures_total{write_result=\"rejected\"} 1",
		"splash_serial_stream_age_seconds 3.000000",
	}

	for _, want := range required {
		if !strings.Contains(body, want) {
			t.Fatalf("expected metrics body to contain %q, body=%q", want, body)
		}
	}
}

func TestUpdateHealthReplacesSnapshot(t *testing.T) {
	server := NewServer("127.0.0.1:9108", HealthState{
		Status:          StatusDegraded,
		ConnectionState: "connecting",
	})

	server.UpdateHealth(HealthState{
		Status:          StatusOK,
		StreamID:        "stream-2",
		SerialDevice:    "/dev/ttyUSB1",
		ConnectionState: "connected",
		NATS:            DependencyOK,
		Configuration:   ConfigurationValid,
	})

	health := server.Health()
	if health.Status != StatusOK {
		t.Fatalf("expected status ok, got %q", health.Status)
	}

	if health.StreamID != "stream-2" {
		t.Fatalf("expected updated stream id, got %q", health.StreamID)
	}
}

func TestUpdateHealthClearsStreamAgeWhenStreamIsInactive(t *testing.T) {
	server := NewServer("127.0.0.1:9108", HealthState{
		Status:          StatusOK,
		StreamID:        "stream-1",
		ConnectionState: "connected",
	})
	server.SetConnectedStream("connected", time.Unix(100, 0))

	server.UpdateHealth(HealthState{
		Status:          StatusDegraded,
		StreamID:        "",
		ConnectionState: "disconnected",
	})

	if !server.Metrics().StreamConnectedAt.IsZero() {
		t.Fatal("expected stream age source to clear when stream becomes inactive")
	}
}

func TestRunReturnsListenError(t *testing.T) {
	t.Cleanup(func() {
		listen = net.Listen
	})

	listen = func(_, _ string) (net.Listener, error) {
		return nil, errors.New("listen failed")
	}

	server := NewServer("127.0.0.1:9108", HealthState{})
	err := server.Run(t.Context())
	if err == nil {
		t.Fatal("expected Run to return an error")
	}

	if !strings.Contains(err.Error(), "listen failed") {
		t.Fatalf("expected listen failure, got %v", err)
	}
}

func TestServeReturnsListenerError(t *testing.T) {
	server := NewServer("127.0.0.1:9108", HealthState{})

	err := server.serve(t.Context(), stubListener{
		addr: dummyAddr("127.0.0.1:9108"),
		err:  errors.New("accept failed"),
	})
	if err == nil {
		t.Fatal("expected serve to return an error")
	}

	if !strings.Contains(err.Error(), "accept failed") {
		t.Fatalf("expected accept failure, got %v", err)
	}
}

type stubListener struct {
	addr net.Addr
	err  error
}

func (l stubListener) Accept() (net.Conn, error) {
	return nil, l.err
}

func (l stubListener) Close() error {
	return nil
}

func (l stubListener) Addr() net.Addr {
	return l.addr
}

type dummyAddr string

func (a dummyAddr) Network() string {
	return "tcp"
}

func (a dummyAddr) String() string {
	return string(a)
}
