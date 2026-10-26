import { TestBed } from '@angular/core/testing';
import { ToastHost } from './toast-host';
import { ToastService } from './toast.service';

describe('ToastHost', () => {
  afterEach(() => vi.useRealTimers());

  it('shows toasts and removes them on dismiss or timeout', () => {
    // Fake timers + synchronous detectChanges: whenStable() would wait on the faked timers in zoneless mode.
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [ToastHost] });
    const fixture = TestBed.createComponent(ToastHost);
    const toasts = TestBed.inject(ToastService);
    const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

    toasts.show('Document is checked out', 1000);
    fixture.detectChanges();
    expect(text()).toContain('Document is checked out');

    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(text()).not.toContain('Document is checked out');

    toasts.show('Another');
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(text()).not.toContain('Another');
  });

  it('styles success toasts differently from errors', () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [ToastHost] });
    const fixture = TestBed.createComponent(ToastHost);
    const toasts = TestBed.inject(ToastService);

    toasts.success('Request submitted');
    toasts.show('Something failed');
    fixture.detectChanges();

    const success = fixture.nativeElement.querySelector('[data-kind="success"]') as HTMLElement;
    const error = fixture.nativeElement.querySelector('[data-kind="error"]') as HTMLElement;
    expect(success.textContent).toContain('Request submitted');
    expect(success.getAttribute('role')).toBe('status');
    expect(error.getAttribute('role')).toBe('alert');
  });
});
