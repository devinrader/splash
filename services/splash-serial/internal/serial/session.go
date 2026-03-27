package serial

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

type Session struct {
	StreamID    string
	Device      string
	State       ConnectionState
	ConnectedAt time.Time
	LastActivity time.Time
	port        Port
}

type Manager struct {
	mu                sync.RWMutex
	writeMu           sync.Mutex
	device            string
	reconnectInterval time.Duration
	factory           Factory
	now               func() time.Time
	after             func(time.Duration) <-chan time.Time
	newStreamID       func() string
	state             ConnectionState
	session           *Session
}

func NewManager(device string, reconnectInterval time.Duration, factory Factory) *Manager {
	if factory == nil {
		factory = NewUnsupportedFactory()
	}

	return &Manager{
		device:            device,
		reconnectInterval: reconnectInterval,
		factory:           factory,
		now:               time.Now,
		after:             time.After,
		newStreamID: func() string {
			return fmt.Sprintf("stream-%d", time.Now().UnixNano())
		},
		state: StateDisconnected,
	}
}

func (m *Manager) Device() string {
	return m.device
}

func (m *Manager) ReconnectInterval() time.Duration {
	return m.reconnectInterval
}

func (m *Manager) State() ConnectionState {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.state
}

func (m *Manager) CurrentSession() (*Session, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.session == nil {
		return nil, false
	}

	copy := *m.session
	return &copy, true
}

func (m *Manager) Connect() (*Session, error) {
	m.mu.Lock()
	m.state = StateConnecting
	m.mu.Unlock()

	port, err := m.factory.Open(m.device)
	if err != nil {
		m.mu.Lock()
		m.state = StateError
		m.session = nil
		m.mu.Unlock()
		return nil, err
	}

	session := &Session{
		StreamID:    m.newStreamID(),
		Device:      m.device,
		State:       StateConnected,
		ConnectedAt: m.now(),
		LastActivity: m.now(),
		port:        port,
	}

	m.mu.Lock()
	m.session = session
	m.state = StateConnected
	m.mu.Unlock()

	copy := *session
	return &copy, nil
}

func (m *Manager) Disconnect(nextState ConnectionState) error {
	m.mu.Lock()
	session := m.session
	m.session = nil
	m.state = nextState
	m.mu.Unlock()

	if session == nil {
		return nil
	}

	return session.port.Close()
}

func (m *Manager) Reconnect() (*Session, error) {
	if err := m.Disconnect(StateDisconnected); err != nil {
		return nil, err
	}

	return m.Connect()
}

func (m *Manager) Read(data []byte) (int, error) {
	m.mu.RLock()
	session := m.session
	m.mu.RUnlock()

	if session == nil {
		return 0, errors.New("no active serial session")
	}

	n, err := session.port.Read(data)
	if n > 0 {
		m.mu.Lock()
		if m.session != nil {
			m.session.LastActivity = m.now()
		}
		m.mu.Unlock()
	}

	return n, err
}

type WriteResult string

const (
	WriteResultOK          WriteResult = "ok"
	WriteResultStaleStream WriteResult = "stale_stream"
	WriteResultTimeout     WriteResult = "timeout"
	WriteResultPortError   WriteResult = "port_error"
	WriteResultRejected    WriteResult = "rejected"
)

type WriteOutcome struct {
	StreamID    string
	ByteCount   int
	WriteResult WriteResult
	ErrorCode   *string
	Detail      *string
}

func (m *Manager) Write(streamID string, data []byte, timeout time.Duration, requiresIdle time.Duration) WriteOutcome {
	m.writeMu.Lock()
	defer m.writeMu.Unlock()

	m.mu.RLock()
	session := m.session
	m.mu.RUnlock()

	if session == nil || session.StreamID != streamID {
		code := "stale_stream"
		detail := "write request targeted an inactive stream"
		return WriteOutcome{
			StreamID:    streamID,
			ByteCount:   len(data),
			WriteResult: WriteResultStaleStream,
			ErrorCode:   &code,
			Detail:      &detail,
		}
	}

	if wait := m.idleWait(session, requiresIdle); wait > 0 {
		select {
		case <-m.after(wait):
		}
	}

	type result struct {
		n   int
		err error
	}

	resultCh := make(chan result, 1)
	go func() {
		n, err := session.port.Write(data)
		resultCh <- result{n: n, err: err}
	}()

	select {
	case res := <-resultCh:
		if res.err != nil {
			code := "port_error"
			detail := res.err.Error()
			return WriteOutcome{
				StreamID:    streamID,
				ByteCount:   len(data),
				WriteResult: WriteResultPortError,
				ErrorCode:   &code,
				Detail:      &detail,
			}
		}

		m.mu.Lock()
		if m.session != nil && m.session.StreamID == streamID {
			m.session.LastActivity = m.now()
		}
		m.mu.Unlock()

		return WriteOutcome{
			StreamID:    streamID,
			ByteCount:   res.n,
			WriteResult: WriteResultOK,
		}
	case <-m.after(timeout):
		code := "timeout"
		detail := "write attempt exceeded timeout"
		return WriteOutcome{
			StreamID:    streamID,
			ByteCount:   len(data),
			WriteResult: WriteResultTimeout,
			ErrorCode:   &code,
			Detail:      &detail,
		}
	}
}

func (m *Manager) idleWait(session *Session, requiresIdle time.Duration) time.Duration {
	if requiresIdle <= 0 {
		return 0
	}

	elapsed := m.now().Sub(session.LastActivity)
	if elapsed >= requiresIdle {
		return 0
	}

	return requiresIdle - elapsed
}
