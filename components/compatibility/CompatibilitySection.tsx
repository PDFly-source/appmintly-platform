/**
 * AppMintly Item 8 — Compatibility & Requirements section for app detail pages.
 *
 * Server component: every value is computed from the published catalog record and
 * the verified APK release metadata, so nothing here needs client state.
 *
 * HONESTY RULES RENDERED HERE
 * - Each row carries its provenance: "Verified release metadata", "Catalog
 *   record" or "Publisher supplied". Unknown rows say "Not specified".
 * - No row claims the visitor's device was tested, and no compatibility promise
 *   is made anywhere in the copy.
 * - The download and install flow is untouched: this section only describes
 *   requirements and links to the existing buttons, which stay where they are.
 */

import { AlertTriangle, Cpu, Download, Globe, HardDrive, Info, ShieldCheck, Smartphone, Wifi } from 'lucide-react';
import type { AppItem } from '@/data/apps';
import { buildCompatibility, installationSteps, type CompatibilityField } from '@/lib/compatibility/model';

const SOURCE_LABEL: Record<CompatibilityField['source'], string> = {
  'apk-metadata': 'Verified release metadata',
  catalog: 'Catalog record',
  publisher: 'Publisher supplied',
  unknown: 'Not specified',
};

const SOURCE_STYLE: Record<CompatibilityField['source'], string> = {
  'apk-metadata': 'border-forge-green/30 bg-forge-green/10 text-ink',
  catalog: 'border-line bg-canvas text-ink',
  publisher: 'border-line bg-canvas text-mut',
  unknown: 'border-line bg-canvas text-mut',
};

function Row({ item }: { item: CompatibilityField }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <dt className="shrink-0 text-[12px] font-semibold text-mut sm:w-52">{item.label}</dt>
      <dd className="min-w-0 flex flex-col gap-1 sm:items-end sm:text-right">
        <span
          className={`min-w-0 text-[13px] font-bold ${
            item.label === 'SHA-256 checksum' ? 'break-all font-mono text-[11px] leading-relaxed' : 'break-words'
          } ${item.value === 'Not specified' ? 'font-semibold italic text-mut' : 'text-ink'}`}
        >
          {item.value}
        </span>
        <span className={`inline-flex w-fit items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${SOURCE_STYLE[item.source]}`}>
          {item.source === 'apk-metadata' ? <ShieldCheck className="h-2.5 w-2.5" aria-hidden="true" /> : null}
          {SOURCE_LABEL[item.source]}
        </span>
      </dd>
    </div>
  );
}

function Group({
  icon,
  title,
  description,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  items: CompatibilityField[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="min-w-0 rounded-xl border border-line bg-white p-4">
      <h3 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-ink">
        {icon}
        {title}
      </h3>
      <p className="mt-1 text-[11px] text-mut">{description}</p>
      <dl className="mt-2">
        {items.map((item) => (
          <Row key={item.label} item={item} />
        ))}
      </dl>
    </section>
  );
}

export function CompatibilitySection({ app }: { app: AppItem }) {
  const model = buildCompatibility(app);
  if (!model) return null;
  const steps = installationSteps(model);
  const unknownCount = model.unknownFields.length;

  return (
    <section aria-labelledby="compatibility-heading" className="mt-8 rounded-2xl border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="compatibility-heading" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-mut">
            <Cpu className="h-4 w-4" aria-hidden="true" /> Compatibility &amp; requirements
          </h2>
          <p className="mt-1 max-w-xl text-[12px] text-mut">
            What {model.name} needs before you download or install it. Requirements come from the verified release
            metadata and the published listing; anything not published is marked “Not specified”.
          </p>
        </div>
        {model.hasVerifiedApk ? (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-forge-green/30 bg-forge-green/10 px-3 py-1.5 text-[11px] font-bold text-ink">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Verified APK release
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-3 py-1.5 text-[11px] font-bold text-mut">
            <Info className="h-3.5 w-3.5" aria-hidden="true" /> No verified APK published
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Group
          icon={<Smartphone className="h-3.5 w-3.5" aria-hidden="true" />}
          title="Android requirements"
          description="Read from the release manifest captured by the build pipeline. No device list is claimed."
          items={model.android}
        />
        <Group
          icon={<Download className="h-3.5 w-3.5" aria-hidden="true" />}
          title="APK information"
          description="The exact published file. The checksum proves the file you get matches the release."
          items={model.apkInfo}
        />
        <Group
          icon={<HardDrive className="h-3.5 w-3.5" aria-hidden="true" />}
          title="Storage"
          description="Download size is exact. Anything the app stores afterwards is described by the publisher."
          items={model.storage}
        />
        <Group
          icon={<Wifi className="h-3.5 w-3.5" aria-hidden="true" />}
          title="Network &amp; internet"
          description="Taken from the published privacy and network record, not from assumptions."
          items={model.network}
        />
        <Group
          icon={<Wifi className="h-3.5 w-3.5" aria-hidden="true" />}
          title="Offline availability"
          description="What works with no connection, as documented by the publisher."
          items={model.offline}
        />
        <Group
          icon={<Globe className="h-3.5 w-3.5" aria-hidden="true" />}
          title="Web browser"
          description="Browser and PWA notes appear only when the catalog records them."
          items={model.browser}
        />
        <Group
          icon={<Smartphone className="h-3.5 w-3.5" aria-hidden="true" />}
          title="Supported platforms"
          description="A platform is listed only when the catalog has real evidence for it."
          items={model.platforms}
        />
      </div>

      {steps.length > 0 ? (
        <div className="mt-4 rounded-xl border border-line bg-canvas p-4">
          <h3 className="text-[12px] font-bold uppercase tracking-wider text-ink">How to install</h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[12px] text-ink">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-line bg-canvas p-4">
        <h3 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-ink">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Known limitations
        </h3>
        {model.limitations.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[12px] text-ink">
            {model.limitations.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[12px] text-mut">No limitations are documented for this listing.</p>
        )}
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-mut">Where this information comes from</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-[11px] text-mut">
          {model.sources.map((source) => (
            <li key={source}>{source}</li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-mut">
          {unknownCount === 0
            ? 'Every field above is published. Even so, AppMintly has not tested your particular device, so treat this as requirements rather than a guarantee.'
            : `${unknownCount} ${unknownCount === 1 ? 'field is' : 'fields are'} not published and shown as “Not specified”. AppMintly has not tested your device and makes no compatibility promise.`}
        </p>
      </div>
    </section>
  );
}
