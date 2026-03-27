package serial

import (
	"fmt"
	"sync"
	"time"
)

type Session struct {
	StreamID     string
	Device       string
	State        ConnectionState
	ConnectedAt  time.Time
	LastActivity time.Time
	port         Port
}

type Manager struct {
	mu                sync.RWMutex
	device            string
	reconnectInterval time.Duration
	factory           Factory
	now               func() time.Time
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
