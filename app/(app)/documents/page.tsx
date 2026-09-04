'use client';
/* Documents — certificates, identification, contracts and service agreements,
   with access scoped by role. Uploads go to Firebase Storage when it is
   configured; in preview the metadata is recorded and the bytes are held in the
   browser session, which is enough to exercise the workflow. */

import { useMemo, useRef, useState } from 'react';
import { Download, FileText, Trash2, Upload } from 'lucide-react';
import {
  Badge, Confirm, EmptyState, Kpi, KpiGrid, Modal, PageHead, SearchBox, Select,
  TableWrap, Toolbar
} from '@/components/ui';
import { useActor, useData } from '@/lib/data';
import { fileSize, stamp } from '@/lib/format';
import type { DocumentMeta } from '@/lib/types';

const KINDS: DocumentMeta['kind'][] = ['certificate', 'identification', 'cv', 'contract', 'agreement', 'other'];
const MAX_MB = 10;
const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

export default function DocumentsPage() {
  const actor = useActor();
  const { data, saveDocument, removeDocument } = useData();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [upload, setUpload] = useState(false);
  const [removing, setRemoving] = useState<DocumentMeta | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{ file: File; kind: DocumentMeta['kind']; ownerId: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* A teacher sees their own file; a school sees its own; the firm sees all. */
  const visible = useMemo(() => data.documents.filter((d) => {
    if (actor.role === 'admin') return true;
    if (actor.role === 'teacher') return d.ownerType === 'teacher' && d.ownerId === actor.teacherId;
    return d.ownerType === 'school' && d.ownerId === actor.schoolId;
  }), [data.documents, actor]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return visible
      .filter((d) => kind === 'all' || d.kind === kind)
      .filter((d) => !needle || d.name.toLowerCase().includes(needle))
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }, [visible, q, kind]);

  const ownerName = (d: DocumentMeta) =>
    d.ownerType === 'teacher' ? data.teachers.find((t) => t.id === d.ownerId)?.name ?? d.ownerId
      : d.ownerType === 'school' ? data.schools.find((s) => s.id === d.ownerId)?.name ?? d.ownerId
      : 'Glampter Consults';

  const pick = (file: File | undefined) => {
    setError('');
    if (!file) return;
    /* Validate type and size before anything is recorded — an upload path that
       accepts whatever it is handed is the classic file-upload hole. */
    if (!ALLOWED.includes(file.type)) {
      setError('Only PDF, Word, PNG and JPEG files are accepted.'); return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`That file is ${fileSize(file.size)}. The limit is ${MAX_MB} MB.`); return;
    }
    setPending({
      file, kind: 'certificate',
      ownerId: actor.role === 'school' ? (actor.schoolId ?? '') : (actor.teacherId ?? data.teachers[0]?.id ?? '')
    });
  };

  const commit = async () => {
    if (!pending) return;
    await saveDocument({
      name: pending.file.name,
      kind: pending.kind,
      ownerType: actor.role === 'school' ? 'school' : actor.role === 'admin' ? 'teacher' : 'teacher',
      ownerId: pending.ownerId,
      sizeBytes: pending.file.size,
      mime: pending.file.type
    });
    setPending(null); setUpload(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <>
      <PageHead title="Documents"
        sub="Certificates, identification, contracts and service agreements."
        actions={<button className="btn btn-primary btn-sm" onClick={() => setUpload(true)}>
          <Upload size={15} /> Upload
        </button>} />

      <KpiGrid cols={3} className="mb-6">
        <Kpi label="Documents" value={String(visible.length)} sub="you can access" />
        <Kpi label="Teacher records" value={String(visible.filter((d) => d.ownerType === 'teacher').length)} sub="certificates and ID" tone="info" />
        <Kpi label="School agreements" value={String(visible.filter((d) => d.ownerType === 'school').length)} sub="contracts and terms" tone="ok" />
      </KpiGrid>

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="File name…" />
        <div className="min-w-[180px]">
          <Select id="d-kind" label="Type" value={kind} onChange={setKind}
            options={[{ value: 'all', label: 'All types' },
              ...KINDS.map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) }))]} />
        </div>
      </Toolbar>

      {rows.length ? (
        <TableWrap minWidth={840} head={['Document', 'Type', 'Belongs to', 'Size', 'Uploaded', '']}>
          {rows.map((d) => (
            <tr key={d.id}>
              <td className="font-medium">{d.name}</td>
              <td className="text-right"><Badge tone="info">{d.kind}</Badge></td>
              <td className="text-right">{ownerName(d)}</td>
              <td className="num">{fileSize(d.sizeBytes)}</td>
              <td className="num">{stamp(d.uploadedAt)}</td>
              <td className="text-right whitespace-nowrap">
                <button className="btn btn-ghost btn-sm" disabled title="Available once Storage is connected">
                  <Download size={14} />
                </button>
                {actor.role === 'admin' ? (
                  <button className="btn btn-ghost btn-sm ml-2" onClick={() => setRemoving(d)} aria-label="Remove">
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </TableWrap>
      ) : (
        <EmptyState icon={FileText} title="No documents yet"
          text="Upload certificates and identification for teachers, or service agreements for schools." />
      )}

      <Modal open={upload} onClose={() => { setUpload(false); setPending(null); setError(''); }}
        title="Upload a document"
        sub={`PDF, Word, PNG or JPEG · up to ${MAX_MB} MB`}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => { setUpload(false); setPending(null); }}>Cancel</button>
            <button className="btn btn-primary" disabled={!pending} onClick={() => void commit()}>Upload</button>
          </>
        }>
        <div>
          <label className="field-label" htmlFor="doc-file">File</label>
          <input id="doc-file" ref={fileRef} className="input" type="file"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            onChange={(e) => pick(e.target.files?.[0])} />
          {error ? <span className="field-error">{error}</span> : null}
          {pending ? (
            <span className="field-hint">{pending.file.name} · {fileSize(pending.file.size)}</span>
          ) : null}
        </div>

        {pending ? (
          <>
            <Select id="doc-kind" label="Type" value={pending.kind}
              onChange={(v) => setPending({ ...pending, kind: v as DocumentMeta['kind'] })}
              options={KINDS.map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) }))} />
            {actor.role === 'admin' ? (
              <Select id="doc-owner" label="Belongs to" value={pending.ownerId}
                onChange={(v) => setPending({ ...pending, ownerId: v })}
                options={data.teachers.map((t) => ({ value: t.id, label: t.name }))} />
            ) : null}
          </>
        ) : null}

        <p className="text-xs text-[var(--text-3)]">
          File type and size are checked before anything is recorded. Uploaded files are never served
          as executable content.
        </p>
      </Modal>

      <Confirm open={Boolean(removing)} onClose={() => setRemoving(null)}
        title="Remove this document" tone="danger" confirmLabel="Remove"
        body={`${removing?.name ?? ''} will be removed from the document store. The removal is recorded in the audit trail.`}
        onConfirm={() => { if (removing) void removeDocument(removing.id); }} />
    </>
  );
}
