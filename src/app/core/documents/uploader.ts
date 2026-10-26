import { HttpBackend, HttpClient, HttpErrorResponse, HttpEvent, HttpEventType } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { EMPTY, Observable, catchError, concat, from, map, of, switchMap, throwError } from 'rxjs';
import { problemMessage } from '../http/problem.interceptor';
import { DocumentView, formatSize } from './document.models';
import { DocumentsApi } from './documents.api';

export type UploadTarget =
  | { folderId: string; name?: string }
  | { instanceId: string }
  | { staged: true }
  | { documentId: string; major?: boolean; comment?: string };

export type UploadEvent =
  | { stage: 'hashing' }
  | { stage: 'sending'; percent: number }
  | { stage: 'confirming' }
  | { stage: 'done'; document: DocumentView };

/** Same limit as document-service (wms.document.storage.max-upload-size). */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** A problem between the browser and storage (the API's own refusals arrive as HttpErrorResponse). */
export class UploadError extends Error {}

/** Lowercase hex SHA-256 of a file, which the confirm step checks (spec §6). */
export const FILE_HASHER = new InjectionToken<(file: Blob) => Promise<string>>('FILE_HASHER', {
  providedIn: 'root',
  factory: () => sha256Hex,
});

export async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function uploadStatus(event: UploadEvent): string {
  switch (event.stage) {
    case 'hashing':
      return 'Checking the file…';
    case 'sending':
      return `Sending ${event.percent}%`;
    case 'confirming':
      return 'Saving…';
    case 'done':
      return 'Uploaded';
  }
}

export function uploadErrorMessage(error: unknown): string {
  if (error instanceof UploadError) {
    return error.message;
  }
  if (error instanceof HttpErrorResponse) {
    return problemMessage(error);
  }
  return 'The upload failed. Please try again.';
}

/**
 * Spec §6 upload flow: hash the file, ask for a ticket, PUT the file straight to storage with exactly the ticket's
 * headers, then confirm. The PUT uses a client without interceptors: storage must never see the Keycloak token, and
 * its errors are reported next to the file rather than as a toast.
 */
@Injectable({ providedIn: 'root' })
export class Uploader {
  private readonly api = inject(DocumentsApi);
  private readonly storage = new HttpClient(inject(HttpBackend));
  private readonly hash = inject(FILE_HASHER);

  upload(file: File, target: UploadTarget): Observable<UploadEvent> {
    if (file.size > MAX_UPLOAD_BYTES) {
      // Checked before hashing: hashing reads the whole file into memory.
      return throwError(() => new UploadError(
        `Files can be at most ${formatSize(MAX_UPLOAD_BYTES)}; this one is ${formatSize(file.size)}.`));
    }
    const sent = from(this.hash(file)).pipe(
      switchMap((sha256) => this.api.startUpload({
        fileName: file.name, size: file.size, sha256, mimeType: file.type || 'application/octet-stream', ...target,
      })),
      switchMap((ticket) => this.storage.put(ticket.url, file, { headers: ticket.headers, reportProgress: true, observe: 'events' }).pipe(
        catchError(() => throwError(() => new UploadError('The file could not be sent to storage. Please try again.'))),
        switchMap((event: HttpEvent<unknown>): Observable<UploadEvent> => {
          if (event.type === HttpEventType.UploadProgress) {
            return of({ stage: 'sending', percent: event.total ? Math.round((100 * event.loaded) / event.total) : 0 });
          }
          if (event.type === HttpEventType.Response) {
            return concat(
              of<UploadEvent>({ stage: 'confirming' }),
              this.api.confirmUpload(ticket.uploadId).pipe(map((document): UploadEvent => ({ stage: 'done', document }))),
            );
          }
          return EMPTY;
        }),
      )),
    );
    return concat(of<UploadEvent>({ stage: 'hashing' }), sent);
  }
}
