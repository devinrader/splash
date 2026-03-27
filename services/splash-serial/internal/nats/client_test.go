package nats

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"
)

func TestNewClientStoresURL(t *testing.T) {
	client := NewClient("nats://splash-core.local:4222")

	if client.URL() != "nats://splash-core.local:4222" {
		t.Fatalf("unexpected URL: %q", client.URL())
	}
}

func TestPublishSerialRXRawRecordsMessage(t *testing.T) {
	client := NewClient("nats://splash-core.local:4222")

	err := client.PublishSerialRXRaw(SerialRXRaw{
		StreamID:   "stream-1",
		ChunkID:    "chunk-1",
		Port:       "/dev/ttyUSB0",
		ReceivedAt: time.Unix(1700000000, 0).UTC(),
		BytesHex:   "0102",
		ByteCount:  2,
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
}

func TestPublishSerialPortStatusRecordsMessage(t *testing.T) {
	client := NewClient("nats://splash-core.local:4222")

	err := client.PublishSerialPortStatus(SerialPortStatus{
		StreamID:   "stream-1",
		Status:     "connected",
		Port:       "/dev/ttyUSB0",
		ReportedAt: time.Unix(1700000000, 0).UTC(),
		Detail:     "adapter detected",
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
	client := NewClient("nats://splash-core.local:4222")

	err := client.PublishSerialTXRaw(SerialTXRaw{
		StreamID:    "stream-1",
		CommandID:   "command-1",
		WrittenAt:   time.Unix(1700000000, 0).UTC(),
		BytesHex:    "aabb",
		ByteCount:   2,
		WriteResult: "ok",
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
	client := NewClient("nats://splash-core.local:4222")
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
	client := NewClient("nats://splash-core.local:4222")
	var connectedTo string

	client.connect = func(url string) (conn, error) {
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
	client := NewClient("nats://splash-core.local:4222")
	client.connect = func(string) (conn, error) {
		return bus, nil
	}

	if err := client.Connect(); err != nil {
		t.Fatalf("Connect returned error: %v", err)
	}

	err := client.PublishSerialRXRaw(SerialRXRaw{
		StreamID:   "stream-1",
		ChunkID:    "chunk-1",
		Port:       "/dev/ttyUSB0",
		ReceivedAt: time.Unix(1700000000, 0).UTC(),
		BytesHex:   "0102",
		ByteCount:  2,
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
	client := NewClient("nats://splash-core.local:4222")
	client.connect = func(string) (conn, error) {
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
	client := NewClient("nats://splash-core.local:4222")
	client.connect = func(string) (conn, error) {
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
	client := NewClient("nats://splash-core.local:4222")
	client.connect = func(string) (conn, error) {
		return nil, errors.New("dial failed")
	}

	if err := client.Connect(); err == nil {
		t.Fatal("expected connect error")
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
	published []PublishedMessage
	handler   func([]byte)
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

func (c *fakeConn) Close() {}

func (c *fakeConn) deliver(subject string, data []byte) {
	if subject == SubjectSerialWriteRequest && c.handler != nil {
		c.handler(data)
	}
}

type fakeSubscription struct{}

func (fakeSubscription) Unsubscribe() error { return nil }
