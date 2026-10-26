import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NotificationPreference } from '../../core/notifications/notification.models';
import { ToastService } from '../../core/ui/toast.service';
import { NotificationPreferences } from './notification-preferences';

const URL = '/api/notifications/preferences';
const stored: NotificationPreference[] = [
  { kind: 'TASK_ASSIGNED', inApp: true, email: true },
  { kind: 'TASK_AVAILABLE', inApp: true, email: false },
  { kind: 'SOMETHING_NEW', inApp: false, email: false },
];

describe('NotificationPreferences', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [NotificationPreferences], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(NotificationPreferences);
    const controller = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const box = (kind: string, channel: 'inApp' | 'email') =>
      element.querySelector<HTMLInputElement>(`[data-testid="pref-${kind}-${channel}"]`)!;
    const save = () => element.querySelector<HTMLButtonElement>('[data-testid="save-preferences"]')!;
    const loaded = (list = stored) => {
      controller.expectOne(URL).flush(list);
      fixture.detectChanges();
    };
    return { fixture, controller, element, box, save, loaded };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('shows each kind with what the person gets now', () => {
    const { element, box, save, loaded } = setup();
    loaded();

    expect(element.textContent).toContain('A task is assigned to me');
    expect(element.textContent).toContain('SOMETHING_NEW'); // a kind this version does not know is still shown
    expect(box('TASK_ASSIGNED', 'inApp').checked).toBe(true);
    expect(box('TASK_ASSIGNED', 'email').checked).toBe(true);
    expect(box('TASK_AVAILABLE', 'email').checked).toBe(false);
    expect(box('TASK_ASSIGNED', 'email').getAttribute('aria-label')).toBe('A task is assigned to me: by email');
    expect(save().disabled).toBe(true);
  });

  it('saves every kind once something changed, and says it worked', () => {
    const { fixture, controller, box, save, loaded } = setup();
    loaded();

    box('TASK_ASSIGNED', 'email').click();
    fixture.detectChanges();
    expect(save().disabled).toBe(false);
    save().click();
    fixture.detectChanges();
    expect(save().disabled).toBe(true); // while it is being saved

    const req = controller.expectOne(URL);
    expect(req.request.method).toBe('PUT');
    const changed = [{ kind: 'TASK_ASSIGNED', inApp: true, email: false }, stored[1], stored[2]];
    expect(req.request.body).toEqual({ preferences: changed });
    req.flush(changed);
    fixture.detectChanges();

    expect(TestBed.inject(ToastService).toasts().map((t) => t.message)).toEqual(['Your notification settings are saved.']);
    expect(box('TASK_ASSIGNED', 'email').checked).toBe(false);
    expect(save().disabled).toBe(true);
  });

  it('changing something back leaves nothing to save', () => {
    const { fixture, box, save, loaded } = setup();
    loaded();

    box('TASK_AVAILABLE', 'inApp').click();
    fixture.detectChanges();
    box('TASK_AVAILABLE', 'inApp').click();
    fixture.detectChanges();

    expect(save().disabled).toBe(true);
  });

  it('keeps what the person chose when saving fails, so they can try again', () => {
    const { fixture, controller, box, save, loaded } = setup();
    loaded();
    box('TASK_ASSIGNED', 'inApp').click();
    fixture.detectChanges();
    save().click();

    controller.expectOne(URL).flush(null, { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();

    expect(box('TASK_ASSIGNED', 'inApp').checked).toBe(false);
    expect(save().disabled).toBe(false);
  });

  it('says so when the settings cannot be loaded, and can try again', () => {
    const { fixture, controller, element, loaded } = setup();
    controller.expectOne(URL).flush(null, { status: 502, statusText: 'Bad Gateway' });
    fixture.detectChanges();
    expect(element.textContent).toContain('could not be loaded');

    element.querySelector<HTMLButtonElement>('[data-testid="retry-preferences"]')!.click();
    loaded();
    expect(element.textContent).toContain('A task is assigned to me');
  });
});
