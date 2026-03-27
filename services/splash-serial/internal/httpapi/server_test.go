package httpapi

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandleHealthzReturnsDegradedState(t *testing.T) {
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

	var got HealthState
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if got.StreamID != "stream-1" {
		t.Fatalf("expected stream_id stream-1, got %q", got.StreamID)
	}

	if got.ConnectionState != "connected" {
		t.Fatalf("expected connection_state connected, got %q", got.ConnectionState)
	}
}

func TestHandleHealthzReturnsServiceUnavailableForError(t *testing.T) {
	server := NewServer("127.0.0.1:9108", HealthState{
		Status:          StatusError,
		SerialDevice:    "/dev/ttyUSB0",
		ConnectionState: "error",
		NATS:            DependencyUnknown,
		Configuration:   ConfigurationValid,
	})

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()

	server.handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status %d, got %d", http.StatusServiceUnavailable, rec.Code)
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

	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rec := httptest.NewRecorder()

	server.handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	body := rec.Body.String()
	required := []string{
		"splash_serial_connection_state{state=\"write_blocked\"} 0",
		"splash_serial_reconnect_total 0",
		"splash_serial_bytes_read_total 0",
		"splash_serial_bytes_written_total 0",
		"splash_serial_write_failures_total{write_result=\"rejected\"} 0",
		"splash_serial_stream_age_seconds 0",
	}

	for _, want := range required {
		if !strings.Contains(body, want) {
			t.Fatalf("expected metrics body to contain %q, body=%q", want, body)
		}
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
