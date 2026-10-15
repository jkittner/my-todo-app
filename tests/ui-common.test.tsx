import { act, fireEvent, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { navigate, parseHash, routeHref, useMediaQuery, useNow, useRoute } from '../src/ui/common/hooks';
import { Modal } from '../src/ui/common/Modal';
import { Toast } from '../src/ui/common/Toast';

describe('routing', () => {
  it('parses and builds hash routes', () => {
    expect(parseHash('')).toEqual({ page: 'board', taskId: null });
    expect(parseHash('#/insights')).toEqual({ page: 'insights', taskId: null });
    expect(parseHash('#/calendar?task=a%20b')).toEqual({ page: 'calendar', taskId: 'a b' });
    expect(parseHash('#/nowhere')).toEqual({ page: 'board', taskId: null });
    expect(routeHref('board', 'a b')).toBe('#/board?task=a%20b');
    expect(routeHref('insights')).toBe('#/insights');
  });

  it('follows hash changes', async () => {
    function Show() {
      const r = useRoute();
      return <p>{`${r.page}:${r.taskId}`}</p>;
    }
    const { unmount } = render(<Show />);
    expect(screen.getByText('board:null')).toBeInTheDocument();
    await act(async () => {
      navigate('calendar', 'x');
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.getByText('calendar:x')).toBeInTheDocument();
    act(() => {
      unmount();
    });
  });
});

describe('time and media hooks', () => {
  it('refreshes the current time on an interval', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T10:00:00'));
    function Clock() {
      return <p>{useNow(1000).toISOString()}</p>;
    }
    const { unmount } = render(<Clock />);
    const first = screen.getByText(/2026/).textContent;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText(/2026/).textContent).not.toBe(first);
    act(() => {
      unmount();
    });
  });

  it('tracks media query changes', () => {
    let listener: () => void = () => {};
    let matches = false;
    const remove = vi.fn();
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q) =>
        ({
          media: q,
          get matches() {
            return matches;
          },
          addEventListener: (_: string, fn: () => void) => (listener = fn),
          removeEventListener: remove,
        }) as unknown as MediaQueryList,
    );
    function Show() {
      return <p>{useMediaQuery('(max-width: 1px)') ? 'small' : 'large'}</p>;
    }
    const { unmount } = render(<Show />);
    expect(screen.getByText('large')).toBeInTheDocument();
    matches = true;
    act(() => {
      listener();
    });
    expect(screen.getByText('small')).toBeInTheDocument();
    act(() => {
      unmount();
    });
    expect(remove).toHaveBeenCalled();
  });
});

describe('Modal', () => {
  it('focuses the first field, traps Tab, closes on Escape, and restores focus', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(
      <Modal title="Edit" onClose={onClose}>
        <button>First</button>
        <button>Last</button>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Edit' })).toBeInTheDocument();
    expect(document.body).toHaveClass('has-modal');
    expect(screen.getByText('First')).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByText('Last')).toHaveFocus();
    await user.tab();
    expect(screen.getByText('First')).toHaveFocus();
    await user.tab();
    expect(screen.getByText('Last')).toHaveFocus();
    await user.keyboard('a');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => {
      unmount();
    });
    expect(document.body).not.toHaveClass('has-modal');
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('prefers a marked field, hides the title on request, and closes on backdrop click', () => {
    const onClose = vi.fn();
    render(
      <Modal title="Add" onClose={onClose} hideTitle size="narrow">
        <button>Other</button>
        <input data-autofocus aria-label="Name" />
      </Modal>,
    );
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(screen.getByText('Add')).toHaveClass('visually-hidden');
    expect(screen.getByRole('dialog')).toHaveClass('modal-narrow');
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('focuses the panel when it has nothing focusable', () => {
    render(
      <Modal title="Empty" onClose={() => {}}>
        <p>Text</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toHaveFocus();
  });
});

describe('Toast', () => {
  it('auto-dismisses info messages and keeps errors', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const { rerender } = render(<Toast message={{ id: 1, text: 'Saved', tone: 'info' }} onDone={onDone} />);
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    rerender(<Toast message={{ id: 2, text: 'Broken', tone: 'error' }} onDone={onDone} />);
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDone).toHaveBeenCalledTimes(2);
    rerender(<Toast message={null} onDone={onDone} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
