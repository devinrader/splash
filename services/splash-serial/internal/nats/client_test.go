package nats

import (
	"context"
	"encoding/json"
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
