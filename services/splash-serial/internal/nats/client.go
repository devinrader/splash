package nats

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	gnats "github.com/nats-io/nats.go"
)

const (
	SubjectSerialRXRaw        = "serial.rx.raw"
	SubjectSerialTXRaw        = "serial.tx.raw"
	SubjectSerialPortStatus   = "serial.port.status"
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

type subscription interface {
	Unsubscribe() error
}

type conn interface {
	Publish(subject string, data []byte) error
	Subscribe(subject string, handler func([]byte)) (subscription, error)
	Close()
}

type natsConn struct {
	conn *gnats.Conn
}

func (c natsConn) Publish(subject string, data []byte) error {
	return c.conn.Publish(subject, data)
}

func (c natsConn) Subscribe(subject string, handler func([]byte)) (subscription, error) {
	sub, err := c.conn.Subscribe(subject, func(msg *gnats.Msg) {
		handler(msg.Data)
	})
	if err != nil {
		return nil, err
	}

	if err := c.conn.Flush(); err != nil {
		sub.Unsubscribe()
		return nil, err
	}

	return sub, nil
}

func (c natsConn) Close() {
	c.conn.Close()
}

type Client struct {
	mu            sync.RWMutex
	url           string
	connect       func(url string) (conn, error)
	conn          conn
	waitCh        chan struct{}
	publish       func(subject string, data []byte) error
	sent          []PublishedMessage
	writeRequests chan SerialWriteRequest
}

func NewClient(url string) *Client {
	client := &Client{
		url:           url,
		connect:       defaultConnect,
		waitCh:        make(chan struct{}),
		writeRequests: make(chan SerialWriteRequest, 16),
	}
	client.publish = client.recordPublish
	return client
}

func (c *Client) URL() string {
	return c.url
}

func (c *Client) Connect() error {
	c.mu.RLock()
	if c.conn != nil {
		c.mu.RUnlock()
		return nil
	}
	url := c.url
	connect := c.connect
	c.mu.RUnlock()

	bus, err := connect(url)
	if err != nil {
		return err
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn != nil {
		bus.Close()
		return nil
	}

	c.conn = bus
	close(c.waitCh)
	return nil
}

func (c *Client) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn != nil {
		c.conn.Close()
		c.conn = nil
		c.waitCh = make(chan struct{})
	}
}

func (c *Client) Connected() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.conn != nil
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
	errCh := make(chan error, 2)

	go func() {
		errCh <- c.subscribeLocal(ctx, handler)
	}()

	for {
		bus, waitCh := c.currentConnection()
		if bus == nil {
			select {
			case <-ctx.Done():
				return nil
			case <-waitCh:
				continue
			case err := <-errCh:
				if err != nil {
					return err
				}
			}
		}

		err := c.subscribeReal(ctx, bus, handler)
		if err == nil || errors.Is(err, context.Canceled) {
			return nil
		}
		return err
	}
}

func (c *Client) subscribeLocal(ctx context.Context, handler func(SerialWriteRequest) error) error {
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

func (c *Client) subscribeReal(ctx context.Context, bus conn, handler func(SerialWriteRequest) error) error {
	errCh := make(chan error, 1)

	sub, err := bus.Subscribe(SubjectSerialWriteRequest, func(data []byte) {
		var request SerialWriteRequest
		if err := json.Unmarshal(data, &request); err != nil {
			select {
			case errCh <- fmt.Errorf("decode %s: %w", SubjectSerialWriteRequest, err):
			default:
			}
			return
		}

		if err := handler(request); err != nil {
			select {
			case errCh <- err:
			default:
			}
		}
	})
	if err != nil {
		return err
	}
	defer sub.Unsubscribe()

	select {
	case <-ctx.Done():
		return nil
	case err := <-errCh:
		return err
	}
}

func (c *Client) publishJSON(subject string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if err := c.publish(subject, data); err != nil {
		return err
	}

	c.mu.RLock()
	bus := c.conn
	c.mu.RUnlock()
	if bus == nil {
		return nil
	}

	return bus.Publish(subject, data)
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

func defaultConnect(url string) (conn, error) {
	client, err := gnats.Connect(url)
	if err != nil {
		return nil, err
	}

	return natsConn{conn: client}, nil
}

func (c *Client) currentConnection() (conn, <-chan struct{}) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.conn, c.waitCh
}
