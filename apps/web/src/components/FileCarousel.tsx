import { useState } from 'react';
import type { Attachment } from '../lib/types';
import { when } from './ui';

/**
 * The design files on a job card.
 *
 * A horizontal strip with the count in the heading, because a worker opening a
 * job needs to know at a glance whether there are five drawings or one. PDFs get
 * an icon rather than a thumbnail: rendering the first page would need a PDF
 * library in the bundle, and the filename is what people actually recognise a
 * drawing by.
 */
export function FileCarousel({
  attachments,
  onRemove,
}: {
  attachments: Attachment[];
  onRemove?: (id: string) => void;
}) {
  const [open, setOpen] = useState<Attachment | null>(null);

  if (attachments.length === 0) {
    return <p className="empty">No design files attached yet.</p>;
  }

  return (
    <>
      <div className="carousel">
        {attachments.map((file) => (
          <figure key={file.id} className="carousel-item">
            <a
              href={file.url}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                // Images preview in place; a PDF is better opened by the
                // browser's own viewer than crammed into a lightbox.
                if (!file.isPdf) {
                  event.preventDefault();
                  setOpen(file);
                }
              }}
            >
              {file.isPdf ? (
                <div className="file-tile pdf">
                  <span className="file-ext">PDF</span>
                </div>
              ) : (
                <img src={file.url} alt={file.filename} loading="lazy" />
              )}
            </a>
            <figcaption title={file.filename}>{file.filename}</figcaption>
            {onRemove && (
              <button
                className="file-remove"
                title="Remove this file"
                onClick={() => onRemove(file.id)}
              >
                ×
              </button>
            )}
          </figure>
        ))}
      </div>

      {open && (
        <div className="lightbox" onClick={() => setOpen(null)} role="dialog">
          <img src={open.url} alt={open.filename} />
          <p>
            {open.filename} · uploaded by {open.uploadedBy.name} · {when(open.createdAt)}
          </p>
        </div>
      )}
    </>
  );
}
