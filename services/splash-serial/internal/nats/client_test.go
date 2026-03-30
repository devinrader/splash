package nats

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	gnats "github.com/nats-io/nats.go"
)

func TestNewClientStoresURL(t *testing.T) {
	client := NewClient("nats://splash-core.local:4222", time.Second)

	if client.URL() != "nats://splash-core.local:4222" {
		t.Fatalf("unexpected URL: %q", client.URL())
	}
}

func TestNewClientDefaultsReconnectWait(t *testing.T) {
	client := NewClient("nats://splash-core.local:4222", 0)

	if client.reconnectWait != 2*time.Second {
		t.Fatalf("expected default reconnect wait, got %v", client.reconnectWait)
	}

	if client.status != ConnectionStatusClosed {
		t.Fatalf("expected initial closed status, got %q", client.status)
	}
}

func TestPublishSerialRXRawRecordsMessage(t *testing.T) {
	client := NewClient("nats://splash-core.local:4222", time.Second)

	err := client.PublishSerialRXRaw(SerialRXRaw{
		SerialInstanceID: "serial-1",
		StreamID:         "stream-1",
		ChunkID:          "chunk-1",
		Port:             "/dev/ttyUSB0",
		ReceivedAt:       time.Unix(1700000000, 0).UTC(),
		BytesHex:         "0102",
		ByteCount:        2,
	})
	if err != nil {
		t.Fatalf("PublishSerialRXRaw returned error: %v", err)
	}

	sent := client.PublishedMessages()
	if len(sent) != 1 {
		t.Fatalf("expected 1 message, got %d", len(sent))
	}

	if sent[0].Subject != SubjectSerialRXRaw {
		t.Fatalf("unexpected subject: %q", sent[0].Subject)
	}

	var payload SerialRXRaw
	if err := json.Unmarshal(sent[0].Data, &payload); err != nil {
		t.Fatalf("Unmarshal returned error: %v", err)
	}

	if payload.BytesHex != "0102" {
		t.Fatalf("unexpected payload bytes: %q", payload.BytesHex)
	}

	if payload.SerialInstanceID != "serial-1" {
		t.Fatalf("unexpected serial instance id: %q", payload.SerialInstanceID)
	}
}

func TestPublishSerialPortStatusRecordsMessage(t *testing.T) {
	client := NewClient("nats://splash-core.local:4222", time.Second)

	err := client.PublishSerialPortStatus(SerialPortStatus{
		SerialInstanceID: "serial-1",
		StreamID:         "stream-1",
		Status:           "connected",
		Port:             "/dev/ttyUSB0",
		ReportedAt:       time.Unix(1700000000, 0).UTC(),
		Detail:           "adapter detected",
	})
	if err != nil {
		t.Fatalf("PublishSerialPortStatus returned error: %v", err)
	}

	sent := client.PublishedMessages()
	if len(sent) != 1 {
		t.Fatalf("expected 1 message, got %d", len(sent))
	}

	if sent[0].Subject != SubjectSerialPortStatus {
		t.Fatalf("unexpected subject: %q", sent[0].Subject)
	}
}

func TestPublishSerialTXRawRecordsMessage(t *testing.T) {
	client := NewClient("nats://splash-core.local:4222", time.Second)

	err := client.PublishSerialTXRaw(SerialTXRaw{
		SerialInstanceID: "serial-1",
		StreamID:         "stream-1",
		CommandID:        "command-1",
		WrittenAt:        time.Unix(1700000000, 0).UTC(),
		BytesHex:         "aabb",
		ByteCount:        2,
		WriteResult:      "ok",
	})
	if err != nil {
		t.Fatalf("PublishSerialTXRaw returned error: %v", err)
	}

	sent := client.PublishedMessages()
	if len(sent) != 1 {
		t.Fatalf("expected 1 message, got %d", len(sent))
	}

	if sent[0].Subject != SubjectSerialTXRaw {
		t.Fatalf("unexpected subject: %q", sent[0].Subject)
	}
}

func TestSubscribeSerialWriteRequestsHandlesDeliveredRequest(t *testing.T) {
	client := NewClient("nats://splash-core.local:4222", time.Second)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan SerialWriteRequest, 1)
	go func() {
		err := client.SubscribeSerialWriteRequests(ctx, func(request SerialWriteRequest) error {
			done <- request
			cancel()
			return nil
		})
		if err != nil {
			t.Errorf("SubscribeSerialWriteRequests returned error: %v", err)
		}
	}()

	client.DeliverSerialWriteRequest(SerialWriteRequest{
		StreamID:  "stream-1",
		CommandID: "command-1",
		BytesHex:  "0102",
		ByteCount: 2,
	})

	select {
	case request := <-done:
		if request.CommandID != "command-1" {
			t.Fatalf("unexpected command id: %q", request.CommandID)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for delivered write request")
	}
}

func TestConnectUsesConfiguredURL(t *testing.T) {
	client := NewClient("nats://splash-core.local:4222", time.Second)
	var connectedTo string

	client.connect = func(url string, _ time.Duration) (conn, error) {
		connectedTo = url
		return &fakeConn{}, nil
	}

	if err := client.Connect(); err != nil {
		t.Fatalf("Connect returned error: %v", err)
	}

	if connectedTo != "nats://splash-core.local:4222" {
		t.Fatalf("expected connect URL to match, got %q", connectedTo)
	}
}

func TestPublishSerialRXRawPublishesToRealConnectionWhenConnected(t *testing.T) {
	bus := &fakeConn{}
	client := NewClient("nats://splash-core.local:4222", time.Second)
	client.connect = func(string, time.Duration) (conn, error) {
		return bus, nil
	}

	if err := client.Connect(); err != nil {
		t.Fatalf("Connect returned error: %v", err)
	}

	err := client.PublishSerialRXRaw(SerialRXRaw{
		SerialInstanceID: "serial-1",
		StreamID:         "stream-1",
		ChunkID:          "chunk-1",
		Port:             "/dev/ttyUSB0",
		ReceivedAt:       time.Unix(1700000000, 0).UTC(),
		BytesHex:         "0102",
		ByteCount:        2,
	})
	if err != nil {
		t.Fatalf("PublishSerialRXRaw returned error: %v", err)
	}

	if len(bus.published) != 1 {
		t.Fatalf("expected 1 real publish, got %d", len(bus.published))
	}

	if bus.published[0].Subject != SubjectSerialRXRaw {
		t.Fatalf("unexpected real publish subject: %q", bus.published[0].Subject)
	}
}

func TestSubscribeSerialWriteRequestsUsesRealSubscriptionWhenConnected(t *testing.T) {
	bus := &fakeConn{}
	client := NewClient("nats://splash-core.local:4222", time.Second)
	client.connect = func(string, time.Duration) (conn, error) {
		return bus, nil
	}

	if err := client.Connect(); err != nil {
		t.Fatalf("Connect returned error: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan SerialWriteRequest, 1)
	go func() {
		err := client.SubscribeSerialWriteRequests(ctx, func(request SerialWriteRequest) error {
			done <- request
			cancel()
			return nil
		})
		if err != nil {
			t.Errorf("SubscribeSerialWriteRequests returned error: %v", err)
		}
	}()

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if bus.handler != nil {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	bus.deliver(SubjectSerialWriteRequest, mustJSON(t, SerialWriteRequest{
		StreamID:  "stream-1",
		CommandID: "command-1",
		BytesHex:  "0102",
		ByteCount: 2,
	}))

	select {
	case request := <-done:
		if request.CommandID != "command-1" {
			t.Fatalf("unexpected command id: %q", request.CommandID)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for subscribed request")
	}
}

func TestSubscribeSerialWriteRequestsReturnsDecodeError(t *testing.T) {
	bus := &fakeConn{}
	client := NewClient("nats://splash-core.local:4222", time.Second)
	client.connect = func(string, time.Duration) (conn, error) {
		return bus, nil
	}

	if err := client.Connect(); err != nil {
		t.Fatalf("Connect returned error: %v", err)
	}

	errCh := make(chan error, 1)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		errCh <- client.SubscribeSerialWriteRequests(ctx, func(SerialWriteRequest) error {
			return nil
		})
	}()

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if bus.handler != nil {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	bus.deliver(SubjectSerialWriteRequest, []byte("not-json"))

	select {
	case err := <-errCh:
		if err == nil {
			t.Fatal("expected decode error")
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for decode error")
	}
}

func TestConnectReturnsDialError(t *testing.T) {
	client := NewClient("nats://splash-core.local:4222", time.Second)
	client.connect = func(string, time.Duration) (conn, error) {
		return nil, errors.New("dial failed")
	}

	if err := client.Connect(); err == nil {
		t.Fatal("expected connect error")
	}
}

func TestConnectedAndCloseReflectConnectionState(t *testing.T) {
	bus := &fakeConn{}
	client := NewClient("nats://splash-core.local:4222", time.Second)
	client.connect = func(string, time.Duration) (conn, error) {
		return bus, nil
	}

	if client.Connected() {
		t.Fatal("expected disconnected client before connect")
	}

	if err := client.Connect(); err != nil {
		t.Fatalf("Connect returned error: %v", err)
	}

	if !client.Connected() {
		t.Fatal("expected connected client after connect")
	}

	client.Close()

	if client.Connected() {
		t.Fatal("expected disconnected client after close")
	}

	if !bus.closed {
		t.Fatal("expected underlying connection to close")
	}
}

func TestConnectedTracksRuntimeStatusChanges(t *testing.T) {
	bus := &fakeConn{}
	client := NewClient("nats://splash-core.local:4222", time.Second)
	client.connect = func(string, time.Duration) (conn, error) {
		return bus, nil
	}

	if err := client.Connect(); err != nil {
		t.Fatalf("Connect returned error: %v", err)
	}

	if !client.Connected() {
		t.Fatal("expected connected client after connect")
	}

	waitForCondition(t, time.Second, func() bool {
		return bus.statusListenerCount() > 0
	})

	bus.emitStatus(ConnectionStatusDisconnected)
	if got := <-client.StatusChanges(); got != ConnectionStatusConnected {
		t.Fatalf("expected initial connected event, got %q", got)
	}
	waitForCondition(t, time.Second, func() bool {
		return !client.Connected()
	})

	bus.emitStatus(ConnectionStatusConnected)
	if got := <-client.StatusChanges(); got != ConnectionStatusDisconnected {
		t.Fatalf("expected disconnected event, got %q", got)
	}
	waitForCondition(t, time.Second, func() bool {
		return client.Connected()
	})

	bus.emitStatus(ConnectionStatusClosed)
	if got := <-client.StatusChanges(); got != ConnectionStatusConnected {
		t.Fatalf("expected connected event, got %q", got)
	}
	waitForCondition(t, time.Second, func() bool {
		return !client.Connected()
	})
	if got := <-client.StatusChanges(); got != ConnectionStatusClosed {
		t.Fatalf("expected closed event, got %q", got)
	}
}

func TestSubscribeSerialWriteRequestsResubscribesAfterConnectionClosed(t *testing.T) {
	first := &fakeConn{}
	second := &fakeConn{}
	connectCalls := 0
	client := NewClient("nats://splash-core.local:4222", time.Second)
	client.connect = func(string, time.Duration) (conn, error) {
		connectCalls++
		if connectCalls == 1 {
			return first, nil
		}
		return second, nil
	}

	if err := client.Connect(); err != nil {
		t.Fatalf("Connect returned error: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan SerialWriteRequest, 1)
	errCh := make(chan error, 1)
	go func() {
		errCh <- client.SubscribeSerialWriteRequests(ctx, func(request SerialWriteRequest) error {
			done <- request
			cancel()
			return nil
		})
	}()

	waitForCondition(t, time.Second, func() bool {
		return first.handler != nil
	})
	waitForCondition(t, time.Second, func() bool {
		return first.statusListenerCount() > 0
	})

	first.emitStatus(ConnectionStatusClosed)

	waitForCondition(t, time.Second, func() bool {
		return !client.Connected()
	})

	if err := client.Connect(); err != nil {
		t.Fatalf("reconnect returned error: %v", err)
	}

	waitForCondition(t, time.Second, func() bool {
		return second.handler != nil
	})

	second.deliver(SubjectSerialWriteRequest, mustJSON(t, SerialWriteRequest{
		StreamID:  "stream-2",
		CommandID: "command-2",
		BytesHex:  "abcd",
		ByteCount: 2,
	}))

	select {
	case request := <-done:
		if request.CommandID != "command-2" {
			t.Fatalf("unexpected command id: %q", request.CommandID)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for re-subscribed request")
	}

	select {
	case err := <-errCh:
		if err != nil {
			t.Fatalf("SubscribeSerialWriteRequests returned error: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for subscribe loop to exit")
	}
}

func TestConnectReturnsNilWhenAlreadyConnected(t *testing.T) {
	first := &fakeConn{}
	second := &fakeConn{}
	connectCalls := 0
	client := NewClient("nats://splash-core.local:4222", time.Second)
	client.connect = func(string, time.Duration) (conn, error) {
		connectCalls++
		if connectCalls == 1 {
			return first, nil
		}
		return second, nil
	}

	if err := client.Connect(); err != nil {
		t.Fatalf("first Connect returned error: %v", err)
	}

	if err := client.Connect(); err != nil {
		t.Fatalf("second Connect returned error: %v", err)
	}

	if connectCalls != 1 {
		t.Fatalf("expected one connect call, got %d", connectCalls)
	}

	if first.closed {
		t.Fatal("did not expect active connection to close")
	}
}

func TestMarkConnectionClosedIgnoresInactiveBus(t *testing.T) {
	active := &fakeConn{}
	other := &fakeConn{}
	client := NewClient("nats://splash-core.local:4222", time.Second)
	client.conn = active
	client.status = ConnectionStatusConnected

	client.markConnectionClosed(other)

	if client.conn != active {
		t.Fatal("expected active connection to remain unchanged")
	}

	if client.status != ConnectionStatusConnected {
		t.Fatalf("expected status to remain connected, got %q", client.status)
	}
}

func TestMapConnectionStatus(t *testing.T) {
	cases := []struct {
		in   gnats.Status
		want ConnectionStatus
	}{
		{in: gnats.CONNECTED, want: ConnectionStatusConnected},
		{in: gnats.DISCONNECTED, want: ConnectionStatusDisconnected},
		{in: gnats.RECONNECTING, want: ConnectionStatusReconnecting},
		{in: gnats.CLOSED, want: ConnectionStatusClosed},
	}

	for _, tc := range cases {
		if got := mapConnectionStatus(tc.in); got != tc.want {
			t.Fatalf("mapConnectionStatus(%v) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func mustJSON(t *testing.T, payload any) []byte {
	t.Helper()

	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("Marshal returned error: %v", err)
	}

	return data
}

type fakeConn struct {
	mu        sync.Mutex
	published []PublishedMessage
	handler   func([]byte)
	closed    bool
	statusChs []chan ConnectionStatus
}

func (c *fakeConn) Publish(subject string, data []byte) error {
	copyData := append([]byte(nil), data...)
	c.published = append(c.published, PublishedMessage{
		Subject: subject,
		Data:    copyData,
	})
	return nil
}

func (c *fakeConn) Subscribe(subject string, handler func([]byte)) (subscription, error) {
	if subject != SubjectSerialWriteRequest {
		return nil, errors.New("unexpected subject")
	}

	c.handler = handler
	return fakeSubscription{}, nil
}

func (c *fakeConn) Close() { c.closed = true }

func (c *fakeConn) StatusChanged() <-chan ConnectionStatus {
	c.mu.Lock()
	defer c.mu.Unlock()

	ch := make(chan ConnectionStatus, 10)
	c.statusChs = append(c.statusChs, ch)
	return ch
}

func (c *fakeConn) deliver(subject string, data []byte) {
	if subject == SubjectSerialWriteRequest && c.handler != nil {
		c.handler(data)
	}
}

func (c *fakeConn) emitStatus(status ConnectionStatus) {
	c.mu.Lock()
	defer c.mu.Unlock()

	for _, ch := range c.statusChs {
		ch <- status
		if status == ConnectionStatusClosed {
			close(ch)
		}
	}
	if status == ConnectionStatusClosed {
		c.statusChs = nil
	}
}

func (c *fakeConn) statusListenerCount() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.statusChs)
}

type fakeSubscription struct{}

func (fakeSubscription) Unsubscribe() error { return nil }

func waitForCondition(t *testing.T, timeout time.Duration, condition func() bool) {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatal("timed out waiting for condition")
}
