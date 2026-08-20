import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActivityLog from './ActivityLog';

const events = [
  { id: '1', category: 'scan', status: 'success', title: 'Fleet scan completed', message: '3 findings', createdAt: new Date().toISOString() },
  { id: '2', category: 'remediation', status: 'success', provider: 'AWS', title: 'Resource resolved', message: 'vol-1 deleted', createdAt: new Date().toISOString() },
  { id: '3', category: 'credential', status: 'warning', provider: 'GCP', title: 'Connection test — Invalid credentials', message: 'rejected', createdAt: new Date().toISOString() },
];

describe('ActivityLog', () => {
  it('renders every event by default', () => {
    render(<ActivityLog events={events} onClear={vi.fn()} />);
    expect(screen.getByText('Fleet scan completed')).toBeInTheDocument();
    expect(screen.getByText('Resource resolved')).toBeInTheDocument();
    expect(screen.getByText(/Connection test/)).toBeInTheDocument();
  });

  it('filters by category', async () => {
    const user = userEvent.setup();
    render(<ActivityLog events={events} onClear={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'credential' }));
    expect(screen.queryByText('Fleet scan completed')).not.toBeInTheDocument();
    expect(screen.getByText(/Connection test/)).toBeInTheDocument();
  });

  it('filters by search text across title/message/provider', async () => {
    const user = userEvent.setup();
    render(<ActivityLog events={events} onClear={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('Search activity'), 'vol-1');
    expect(screen.getByText('Resource resolved')).toBeInTheDocument();
    expect(screen.queryByText('Fleet scan completed')).not.toBeInTheDocument();
  });

  it('calls onClear when the clear button is pressed', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<ActivityLog events={events} onClear={onClear} />);
    await user.click(screen.getByRole('button', { name: 'Clear activity history' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('shows an empty state with no events', () => {
    render(<ActivityLog events={[]} onClear={vi.fn()} />);
    expect(screen.getByText('No activity yet')).toBeInTheDocument();
  });
});
