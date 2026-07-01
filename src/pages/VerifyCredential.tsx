import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { BrandMark } from '@/components/common/Logo';
import { certificatesApi } from '@/lib/api';
import { useAsync } from '@/lib/useApi';
import { ShieldCheck, ShieldX, Loader2, Award, FileText } from 'lucide-react';

function safeDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

const Row: React.FC<{ label: string; value?: string | null }> = ({ label, value }) =>
  value ? (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-right break-words">{value}</span>
    </div>
  ) : null;

const VerifyCredential: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { data, loading, error } = useAsync(() => certificatesApi.verify(token ?? ''), [token]);

  const valid = !!data?.valid;
  const isCert = data?.type === 'certificate';

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center px-4 py-10">
      <Link to="/" className="flex items-center gap-2 mb-8">
        <BrandMark size={34} />
        <span className="text-lg font-bold text-foreground">SemanticGuard AI</span>
      </Link>

      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-border">
          <h1 className="text-base font-semibold text-foreground">Credential Verification</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Semantic Services Rwanda Ltd</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : error || !data ? (
          <div className="flex flex-col items-center text-center px-6 py-14">
            <div className="w-14 h-14 rounded-full bg-destructive/10 border-2 border-destructive/40 flex items-center justify-center mb-4">
              <ShieldX className="w-7 h-7 text-destructive" />
            </div>
            <p className="font-semibold text-foreground">Verification unavailable</p>
            <p className="text-sm text-muted-foreground mt-1">We couldn't verify this document right now.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center text-center px-6 py-8">
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 border-2 ${
                  valid
                    ? 'bg-green-500/10 border-green-500/40 text-green-600 dark:text-green-400'
                    : 'bg-destructive/10 border-destructive/40 text-destructive'
                }`}
              >
                {valid ? <ShieldCheck className="w-8 h-8" /> : <ShieldX className="w-8 h-8" />}
              </div>
              <p className="text-lg font-bold text-foreground">
                {valid ? 'Authentic Document' : data.revoked ? 'Document Revoked' : 'Not Found'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {valid
                  ? 'This document was genuinely issued by Semantic Services Rwanda.'
                  : data.revoked
                    ? 'This document has been revoked and is no longer valid.'
                    : 'No matching document could be found for this code.'}
              </p>
            </div>

            {(data.number || data.candidateName) && (
              <div className="px-6 pb-6">
                <div className="flex items-center gap-2 mb-2 text-sm font-medium text-foreground">
                  {isCert ? (
                    <Award className="w-4 h-4 text-amber-500" />
                  ) : (
                    <FileText className="w-4 h-4 text-primary" />
                  )}
                  {isCert ? 'Completion Certificate' : 'Offer Letter'}
                </div>
                <div className="rounded-md border border-border px-4 py-1">
                  <Row label="Reference No." value={data.number} />
                  <Row label="Name" value={data.candidateName} />
                  <Row label={isCert ? 'Assessment' : 'Position'} value={data.title} />
                  {data.position && !isCert ? null : <Row label="Position" value={data.position} />}
                  {data.integrityScore != null && (
                    <Row label="Integrity Score" value={`${Math.round(data.integrityScore)}%`} />
                  )}
                  <Row label="Issued" value={safeDate(data.issuedAt)} />
                  <Row label="Issuer" value={data.issuer} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-6 text-center max-w-md">
        This verification page confirms the authenticity of certificates and offer letters issued by
        Semantic Services Rwanda Ltd through SemanticGuard AI.
      </p>
    </div>
  );
};

export default VerifyCredential;
