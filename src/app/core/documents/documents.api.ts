import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SILENT_ERRORS } from '../http/problem.interceptor';
import {
  AclEntry, AclView, ContentLink, DocumentSummary, DocumentType, DocumentView, DraftView, FolderView, FormRef, SearchOptions,
  SearchResults, StartUpload, UploadTicket,
} from './document.models';

const BASE = '/api/documents';

/** document-service (spec §6), through the gateway. */
@Injectable({ providedIn: 'root' })
export class DocumentsApi {
  private readonly http = inject(HttpClient);

  root(silent = false): Observable<FolderView> {
    return this.http.get<FolderView>(`${BASE}/folders/root`, { context: context(silent) });
  }

  folder(id: string, silent = false): Observable<FolderView> {
    return this.http.get<FolderView>(`${BASE}/folders/${encodeURIComponent(id)}`, { context: context(silent) });
  }

  createFolder(parentId: string, name: string): Observable<FolderView> {
    return this.http.post<FolderView>(`${BASE}/folders`, { parentId, name });
  }

  renameFolder(id: string, name: string): Observable<FolderView> {
    return this.http.patch<FolderView>(`${BASE}/folders/${encodeURIComponent(id)}`, { name });
  }

  deleteFolder(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/folders/${encodeURIComponent(id)}`);
  }

  acl(id: string, silent = false): Observable<AclView> {
    return this.http.get<AclView>(`${BASE}/folders/${encodeURIComponent(id)}/acl`, { context: context(silent) });
  }

  setAcl(id: string, inheritAcl: boolean, entries: AclEntry[]): Observable<AclView> {
    return this.http.put<AclView>(`${BASE}/folders/${encodeURIComponent(id)}/acl`, { inheritAcl, entries });
  }

  documents(folderId: string, silent = false): Observable<DocumentSummary[]> {
    return this.http.get<DocumentSummary[]>(`${BASE}/folders/${encodeURIComponent(folderId)}/documents`, { context: context(silent) });
  }

  document(id: string, silent = false): Observable<DocumentView> {
    return this.http.get<DocumentView>(`${BASE}/documents/${encodeURIComponent(id)}`, { context: context(silent) });
  }

  rename(id: string, name: string): Observable<DocumentView> {
    return this.http.patch<DocumentView>(`${BASE}/documents/${encodeURIComponent(id)}`, { name });
  }

  setMetadata(id: string, typeId: string | null, metadata: Record<string, unknown>): Observable<DocumentView> {
    return this.http.put<DocumentView>(`${BASE}/documents/${encodeURIComponent(id)}/metadata`, { typeId, metadata });
  }

  deleteDocument(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/documents/${encodeURIComponent(id)}`);
  }

  checkout(id: string): Observable<DocumentView> {
    return this.http.post<DocumentView>(`${BASE}/documents/${encodeURIComponent(id)}/checkout`, null);
  }

  cancelCheckout(id: string, silent = false): Observable<DocumentView> {
    return this.http.post<DocumentView>(`${BASE}/documents/${encodeURIComponent(id)}/checkout/cancel`, null, { context: context(silent) });
  }

  createWritten(folderId: string, name: string): Observable<DocumentView> {
    return this.http.post<DocumentView>(`${BASE}/written`, { folderId, name });
  }

  draft(id: string, silent = false): Observable<DraftView> {
    return this.http.get<DraftView>(`${BASE}/documents/${encodeURIComponent(id)}/draft`, { context: context(silent) });
  }

  /** Quiet: the editor says for itself whether a save worked. */
  saveDraft(id: string, html: string, revision: number): Observable<DraftView> {
    return this.http.put<DraftView>(`${BASE}/documents/${encodeURIComponent(id)}/draft`, { html, revision }, { context: context(true) });
  }

  /** The PDF approvers read while a written document is in approval. */
  review(id: string, silent = false): Observable<ContentLink> {
    return this.http.get<ContentLink>(`${BASE}/documents/${encodeURIComponent(id)}/review`, { context: context(silent) });
  }

  content(id: string, versionId: string, inline: boolean, silent = false): Observable<ContentLink> {
    return this.http.get<ContentLink>(
      `${BASE}/documents/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/content`,
      { params: { inline }, context: context(silent) },
    );
  }

  restore(id: string, versionId: string): Observable<DocumentView> {
    return this.http.post<DocumentView>(
      `${BASE}/documents/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/restore`, {});
  }

  /** Quiet: the uploader reports problems next to the file. */
  startUpload(request: StartUpload): Observable<UploadTicket> {
    return this.http.post<UploadTicket>(`${BASE}/uploads`, request, { context: context(true) });
  }

  confirmUpload(uploadId: string): Observable<DocumentView> {
    return this.http.post<DocumentView>(`${BASE}/uploads/${encodeURIComponent(uploadId)}/confirm`, null, { context: context(true) });
  }

  instanceDocuments(instanceId: string, silent = false): Observable<DocumentSummary[]> {
    return this.http.get<DocumentSummary[]>(`${BASE}/instances/${encodeURIComponent(instanceId)}/documents`, { context: context(silent) });
  }

  /** Quiet: "Send for approval…" explains a failed link itself and offers to try again. */
  link(id: string, instanceId: string): Observable<DocumentView> {
    return this.http.post<DocumentView>(`${BASE}/documents/${encodeURIComponent(id)}/link`, { instanceId }, { context: context(true) });
  }

  search(q: string, options: SearchOptions = {}, silent = false): Observable<SearchResults> {
    let params = new HttpParams().set('q', q).set('page', options.page ?? 0).set('size', options.size ?? 20);
    if (options.folderId) {
      params = params.set('folderId', options.folderId);
    }
    if (options.typeId) {
      params = params.set('typeId', options.typeId);
    }
    return this.http.get<SearchResults>(`${BASE}/search`, { params, context: context(silent) });
  }

  types(silent = false): Observable<DocumentType[]> {
    return this.http.get<DocumentType[]>(`${BASE}/document-types`, { context: context(silent) });
  }

  createType(name: string, form: FormRef | null): Observable<DocumentType> {
    return this.http.post<DocumentType>(`${BASE}/document-types`, { name, form });
  }

  updateType(id: string, name: string, form: FormRef | null): Observable<DocumentType> {
    return this.http.put<DocumentType>(`${BASE}/document-types/${encodeURIComponent(id)}`, { name, form });
  }

  deleteType(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/document-types/${encodeURIComponent(id)}`);
  }
}

function context(silent: boolean): HttpContext {
  return new HttpContext().set(SILENT_ERRORS, silent);
}
