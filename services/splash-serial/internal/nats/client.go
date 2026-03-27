package nats

import (
	"context"
	"encoding/json"
	"sync"
	"time"
)

const (
	SubjectSerialRXRaw      = "serial.rx.raw"
	SubjectSerialTXRaw      = "serial.tx.raw"
	SubjectSerialPortStatus = "serial.port.status"
	SubjectSerialWriteRequest = "serial.write.request"
)

type BusRequirements struct {
	RequiresIdleMS int `json:"requires_idle_ms"`
}

type SerialRXRaw struct {
	PoolID     string    `json:"pool_id"`
	StreamID   string    `json:"stream_id"`
	ChunkID    string    `json:"chunk_id"`
	Port       string    `json:"port"`
	ReceivedAt time.Time `json:"received_at"`
	BytesHex   string    `json:"bytes_hex"`
	ByteCount  int       `json:"byte_count"`
}

type SerialTXRaw struct {
	PoolID      string    `json:"pool_id"`
	StreamID    string    `json:"stream_id"`
	CommandID   string    `json:"command_id"`
	WrittenAt   time.Time `json:"written_at"`
	BytesHex    string    `json:"bytes_hex"`
	ByteCount   int       `json:"byte_count"`
	WriteResult string    `json:"write_result"`
	ErrorCode   *string   `json:"error_code"`
	Detail      *string   `json:"detail"`
}

type SerialWriteRequest struct {
	PoolID          string          `json:"pool_id"`
	StreamID        string          `json:"stream_id"`
	CommandID       string          `json:"command_id"`
	RequestedAt     time.Time       `json:"requested_at"`
	ProtocolName    string          `json:"protocol_name"`
	BytesHex        string          `json:"bytes_hex"`
	ByteCount       int             `json:"byte_count"`
	BusRequirements BusRequirements `json:"bus_requirements"`
}

type SerialPortStatus struct {
	PoolID     string    `json:"pool_id"`
	StreamID   string    `json:"stream_id"`
	Status     string    `json:"status"`
	Port       string    `json:"port"`
	ReportedAt time.Time `json:"reported_at"`
	Detail     string    `json:"detail,omitempty"`
}

type PublishedMessage struct {
	Subject string
	Data    []byte
}

type Client struct {
	mu      sync.RWMutex
	url     string
	publish func(subject string, data []byte) error
	sent    []PublishedMessage
	writeRequests chan SerialWriteRequest
}

func NewClient(url string) *Client {
	client := &Client{
		url:          url,
		writeRequests: make(chan SerialWriteRequest, 16),
	}
	client.publish = client.recordPublish
	return client
}

func (c *Client) URL() string {
	return c.url
}

func (c *Client) PublishSerialRXRaw(payload SerialRXRaw) error {
	return c.publishJSON(SubjectSerialRXRaw, payload)
}

func (c *Client) PublishSerialTXRaw(payload SerialTXRaw) error {
	return c.publishJSON(SubjectSerialTXRaw, payload)
}

func (c *Client) PublishSerialPortStatus(payload SerialPortStatus) error {
	return c.publishJSON(SubjectSerialPortStatus, payload)
}

func (c *Client) PublishedMessages() []PublishedMessage {
	c.mu.RLock()
	defer c.mu.RUnlock()

	out := make([]PublishedMessage, len(c.sent))
	copy(out, c.sent)
	return out
}

func (c *Client) SubscribeSerialWriteRequests(ctx context.Context, handler func(SerialWriteRequest) error) error {
	for {
		select {
		case <-ctx.Done():
			return nil
		case request := <-c.writeRequests:
			if err := handler(request); err != nil {
				return err
			}
		}
	}
}

func (c *Client) DeliverSerialWriteRequest(request SerialWriteRequest) {
	c.writeRequests <- request
}

func (c *Client) publishJSON(subject string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return c.publish(subject, data)
}

func (c *Client) recordPublish(subject string, data []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	copyData := make([]byte, len(data))
	copy(copyData, data)
	c.sent = append(c.sent, PublishedMessage{
		Subject: subject,
		Data:    copyData,
	})
	return nil
}
