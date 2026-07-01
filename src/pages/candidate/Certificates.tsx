import React, { useState } from 'react';
import { AppLayout } from '@/components/layouts/AppLayout';
import { certificatesApi, type ApiCredential } from '@/lib/api';
import { useAsync } from '@/lib/useApi';
import { Button } from '@/components/ui/button';
import {
  Award,
  FileText,
  Download,
  Loader2,
  AlertCircle,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

function safeDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'MMM d, yyyy');
}

const CredentialCard: React.FC<{ cred: ApiCredential }> = ({ cred }) => {
  const [downloading, setDownloading] = useState(false);
  const isCert = cred.type === 'certificate';
  const Icon = isCert ? Award : FileText;

  const download = async () => {
    setDownloading(true);
    try {
      const kind = isCert ? 'Certificate' : 'Offer-Letter';
      await certificatesApi.download(cred.id, `${kind}-${cred.number}.pdf`);
    } catch {
      toast.error('Could not download the document. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const verifyUrl = `/verify/${cred.verificationToken}`;

  return (
    <div
      className={`bg-card border rounded-md p-5 flex flex-col ${
        cred.revoked ? 'border-destructive/40' : 'border-border'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-11 h-11 rounded-md flex items-center justify-center shrink-0 ${
            isCert ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-primary/10 text-primary'
          }`}
        >
          <Icon className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">
            {isCert ? 'Completion Certificate' : 'Offer Letter'}
          </p>
          <p className="text-xs text-muted-foreground truncate">{cred.title}</p>
        </div>
        {cred.revoked ? (
          <span className="text-[10px] font-medium bg-destructive/10 text-destructive border border-destructive/20 px-2 py-0.5 rounded shrink-0">
            Revoked
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 px-2 py-0.5 rounded shrink-0">
            <ShieldCheck className="w-3 h-3" /> Verified
          </span>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Reference No.</dt>
          <dd className="font-mono font-medium text-foreground break-all">{cred.number}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Issued</dt>
          <dd className="font-medium text-foreground">{safeDate(cred.issuedAt)}</dd>
        </div>
        {cred.position && (
          <div>
            <dt className="text-muted-foreground">Position</dt>
            <dd className="font-medium text-foreground truncate">{cred.position}</dd>
          </div>
        )}
        {isCert && cred.integrityScore != null && (
          <div>
            <dt className="text-muted-foreground">Integrity Score</dt>
            <dd className="font-medium text-foreground">{Math.round(cred.integrityScore)}%</dd>
          </div>
        )}
      </dl>

      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" onClick={download} disabled={downloading} className="flex-1">
          {downloading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Download className="w-4 h-4 mr-1.5" />}
          Download PDF
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a href={verifyUrl} target="_blank" rel="noopener noreferrer" title="Open public verification">
            <ExternalLink className="w-4 h-4" />
          </a>
        </Button>
      </div>
    </div>
  );
};

const Certificates: React.FC = () => {
  const { data, loading, error, reload } = useAsync(() => certificatesApi.list({ perPage: 100 }), []);
  const items = data?.items ?? [];
  const certificates = items.filter((c) => c.type === 'certificate');
  const offers = items.filter((c) => c.type === 'offer_letter');

  return (
    <AppLayout>
      <div className="max-w-5xl space-y-6">
        <div>
          <h1 className="text-xl font-bold text-balance">Certificates & Offer Letters</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Documents issued when you pass an assessment. Download the PDF or share the verification link.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle className="w-8 h-8 text-destructive mb-3" />
            <p className="text-sm font-medium text-foreground">Couldn't load your documents</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={reload}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="border border-dashed border-border rounded-md py-20 flex flex-col items-center justify-center text-center text-muted-foreground">
            <Award className="w-8 h-8 mb-3 opacity-40" />
            <p className="text-sm font-medium text-foreground">No documents yet</p>
            <p className="text-xs mt-1 max-w-sm">
              When you pass an assessment, your completion certificate and offer letter will appear here
              automatically and be emailed to you.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {certificates.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-500" /> Certificates ({certificates.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {certificates.map((c) => (
                    <CredentialCard key={c.id} cred={c} />
                  ))}
                </div>
              </section>
            )}
            {offers.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" /> Offer Letters ({offers.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {offers.map((c) => (
                    <CredentialCard key={c.id} cred={c} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Certificates;
