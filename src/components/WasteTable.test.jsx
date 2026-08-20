import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/externalLinks', () => ({
  openExternal: vi.fn(),
  supabaseProjectUrl: (id) => `https://supabase.com/dashboard/project/${id}`,
}));

const { default: WasteTable } = await import('./WasteTable');

const items = [
  { provider: 'AWS', id: 'vol-1', resource: 'Unattached EBS Volume', details: 'x', monthlyLoss: 60, severity: 'High', remediable: true, status: 'open' },
  { provider: 'AWS', id: 'vol-2', resource: 'Unattached EBS Volume', details: 'y', monthlyLoss: 5, severity: 'Low', remediable: true, status: 'acknowledged' },
  { provider: 'Vercel', id: 'ver-1', resource: 'Inactive Project', details: 'stale-app', monthlyLoss: 20, severity: 'Medium', remediable: true, status: 'resolved' },
  { provider: 'Supabase', id: 'sup-1', resource: 'Paused/Idle Instance', details: 'z', monthlyLoss: 25, severity: 'Medium', remediable: false, status: 'reopened' },
];

describe('WasteTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to showing only active (open + reopened) findings', () => {
    render(<WasteTable wasteItems={items} onKillResource={vi.fn()} />);
    expect(screen.getByText('x')).toBeInTheDocument(); // open
    expect(screen.getByText('z')).toBeInTheDocument(); // reopened
    expect(screen.queryByText('y')).not.toBeInTheDocument(); // acknowledged
    expect(screen.queryByText('stale-app')).not.toBeInTheDocument(); // resolved
  });

  it('the "All" status filter reveals every status', async () => {
    const user = userEvent.setup();
    render(<WasteTable wasteItems={items} onKillResource={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('y')).toBeInTheDocument();
    expect(screen.getByText('stale-app')).toBeInTheDocument();
  });

  it('search filters across provider, resource, details, and id', async () => {
    const user = userEvent.setup();
    render(<WasteTable wasteItems={items} onKillResource={vi.fn()} />);
    await user.type(screen.getByLabelText('Search findings'), 'vol-1');
    expect(screen.getByText('x')).toBeInTheDocument();
    expect(screen.queryByText('z')).not.toBeInTheDocument();
  });

  it('only shows an action button for active (open/reopened) findings', () => {
    render(<WasteTable wasteItems={items} onKillResource={vi.fn()} />);
    // Active rows: vol-1 (remediable -> "Resolve"), sup-1 (review-only -> "Review")
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
  });

  it('opens a confirmation dialog and calls onKillResource on confirm', async () => {
    const user = userEvent.setup();
    const onKillResource = vi.fn().mockResolvedValue(undefined);
    render(<WasteTable wasteItems={items} onKillResource={onKillResource} />);
    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Confirm Termination/ }));
    expect(onKillResource).toHaveBeenCalledWith(expect.objectContaining({ id: 'vol-1' }));
  });

  it('shows a Supabase deep-link in the confirm dialog for review-only Supabase findings', async () => {
    const user = userEvent.setup();
    render(<WasteTable wasteItems={items} onKillResource={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByRole('button', { name: /Open project in Supabase dashboard/ })).toBeInTheDocument();
  });

  it('closes the dialog on Escape', async () => {
    const user = userEvent.setup();
    render(<WasteTable wasteItems={items} onKillResource={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
