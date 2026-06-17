import React, { useState } from 'react';
import { AppLayout } from '@/components/layouts/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Settings, Shield, Bell, Server, Key, Save } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const DETECTION_SETTINGS = [
  { key: 'faceDetection', label: 'Face Detection & Verification', desc: 'Verify candidate identity via webcam' },
  { key: 'eyeTracking', label: 'Eye Gaze Tracking', desc: 'Monitor where candidates look during assessment' },
  { key: 'phoneDetection', label: 'Phone Detection', desc: 'Detect mobile devices using YOLO' },
  { key: 'tabSwitchDetection', label: 'Tab Switch Detection', desc: 'Monitor browser tab changes' },
  { key: 'audioDetection', label: 'Audio Detection', desc: 'Detect suspicious audio events' },
  { key: 'suspiciousMovement', label: 'Suspicious Movement Detection', desc: 'Behavioral movement analysis' },
  { key: 'headPoseEstimation', label: 'Head Pose Estimation', desc: 'Track head orientation anomalies' },
  { key: 'multipleFaceDetection', label: 'Multiple Face Detection', desc: 'Alert when more than one face is detected' },
];

const SystemSettings: React.FC = () => {
  const [detection, setDetection] = useState<Record<string, boolean>>({
    faceDetection: true, eyeTracking: true, phoneDetection: true, tabSwitchDetection: true,
    audioDetection: false, suspiciousMovement: true, headPoseEstimation: true, multipleFaceDetection: true,
  });
  const [sensitivity, setSensitivity] = useState<Record<string, number>>({
    faceDetection: 80, eyeTracking: 70, phoneDetection: 90, tabSwitchDetection: 100,
    audioDetection: 60, suspiciousMovement: 75, headPoseEstimation: 65, multipleFaceDetection: 95,
  });
  const [riskThreshold, setRiskThreshold] = useState(60);
  const [jwtExpiry, setJwtExpiry] = useState(60);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [maxLoginAttempts, setMaxLoginAttempts] = useState(5);
  const [notif, setNotif] = useState({
    emailAlerts: true, criticalOnly: false, slackIntegration: false, smsAlerts: false,
  });

  const toggle = (key: string) => setDetection(d => ({ ...d, [key]: !d[key] }));
  const handleSave = () => toast.success('Settings saved successfully');

  return (
    <AppLayout>
      <div className="max-w-4xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-balance">System Settings</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Configure AI detection, security, and notifications</p>
          </div>
          <Button onClick={handleSave} size="sm">
            <Save className="w-4 h-4 mr-2" /> Save All
          </Button>
        </div>

        <Tabs defaultValue="ai">
          <TabsList className="bg-muted">
            <TabsTrigger value="ai" className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> AI Detection
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5" /> Security
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5" /> Notifications
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" /> System
            </TabsTrigger>
          </TabsList>

          {/* AI Detection */}
          <TabsContent value="ai" className="mt-4 space-y-4">
            {/* Global risk threshold */}
            <div className="bg-card border border-border rounded-md p-5">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                <Settings className="w-4 h-4 text-primary" /> Global Detection Settings
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">Risk Score Threshold (0–100)</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0} max={100}
                      value={riskThreshold}
                      onChange={e => setRiskThreshold(Number(e.target.value))}
                      className="flex-1"
                    />
                    <span className="font-mono font-bold w-8 text-right text-foreground">{riskThreshold}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Candidates above this score will be flagged for review</p>
                </div>
              </div>
            </div>

            {/* Per-detector toggles */}
            <div className="bg-card border border-border rounded-md p-5 space-y-3">
              <h3 className="font-semibold text-sm mb-1">Detection Modules</h3>
              {DETECTION_SETTINGS.map(opt => (
                <div key={opt.key} className="border border-border rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggle(opt.key)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${detection[opt.key] ? 'bg-primary' : 'bg-muted'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${detection[opt.key] ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  {detection[opt.key] && (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-20 shrink-0">Sensitivity</span>
                      <input
                        type="range"
                        min={0} max={100}
                        value={sensitivity[opt.key]}
                        onChange={e => setSensitivity(s => ({ ...s, [opt.key]: Number(e.target.value) }))}
                        className="flex-1"
                      />
                      <span className="font-mono text-xs w-8 text-right text-foreground">{sensitivity[opt.key]}%</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Security */}
          <TabsContent value="security" className="mt-4 space-y-4">
            <div className="bg-card border border-border rounded-md p-5 space-y-4">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-1">
                <Key className="w-4 h-4 text-primary" /> Authentication Settings
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">JWT Expiry (minutes)</Label>
                  <Input type="number" value={jwtExpiry} onChange={e => setJwtExpiry(Number(e.target.value))} min={15} max={1440} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">Max Login Attempts</Label>
                  <Input type="number" value={maxLoginAttempts} onChange={e => setMaxLoginAttempts(Number(e.target.value))} min={3} max={10} />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded border border-border">
                <div>
                  <p className="text-sm font-medium">Require MFA for All Users</p>
                  <p className="text-xs text-muted-foreground">Forces all users to set up two-factor authentication</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMfaRequired(m => !m)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${mfaRequired ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${mfaRequired ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <div className="p-3 bg-muted/50 rounded border border-border space-y-2">
                <p className="text-sm font-medium">Security Features Status</p>
                {[
                  ['JWT Authentication', 'Active'],
                  ['Role-Based Access Control', 'Enforced'],
                  ['Rate Limiting', '100 req/min'],
                  ['CSRF Protection', 'Active'],
                  ['XSS Prevention', 'Active'],
                  ['Brute Force Protection', `Lock after ${maxLoginAttempts} attempts`],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-green-500 font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Notifications */}
          <TabsContent value="notifications" className="mt-4">
            <div className="bg-card border border-border rounded-md p-5 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-1">
                <Bell className="w-4 h-4 text-primary" /> Alert Notifications
              </h3>
              {[
                { key: 'emailAlerts', label: 'Email Alerts', desc: 'Send email notifications for new AI alerts' },
                { key: 'criticalOnly', label: 'Critical Alerts Only', desc: 'Only notify for critical severity alerts' },
                { key: 'slackIntegration', label: 'Slack Integration', desc: 'Post alerts to Slack channel (requires webhook)' },
                { key: 'smsAlerts', label: 'SMS Alerts', desc: 'Send SMS for critical violations' },
              ].map(opt => (
                <div key={opt.key} className="flex items-center justify-between p-3 bg-muted/50 rounded border border-border">
                  <div>
                    <p className="text-sm font-medium text-foreground">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotif(n => ({ ...n, [opt.key]: !n[opt.key as keyof typeof n] }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${notif[opt.key as keyof typeof notif] ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notif[opt.key as keyof typeof notif] ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* System */}
          <TabsContent value="system" className="mt-4">
            <div className="bg-card border border-border rounded-md p-5 space-y-4">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-1">
                <Server className="w-4 h-4 text-primary" /> System Configuration
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">Organization Name</Label>
                  <Input defaultValue="Semantic Services Rwanda" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">Support Email</Label>
                  <Input type="email" defaultValue="admin@semanticservices.rw" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">Max Concurrent Assessments</Label>
                  <Input type="number" defaultValue={10} min={1} max={50} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">Session Timeout (minutes)</Label>
                  <Input type="number" defaultValue={30} min={5} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-normal">Maintenance Mode</Label>
                <div className="p-3 bg-muted/50 rounded border border-border flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground">Maintenance Mode</p>
                    <p className="text-xs text-muted-foreground">Disable user access during maintenance</p>
                  </div>
                  <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-muted">
                    <span className="inline-block h-4 w-4 transform rounded-full bg-white translate-x-1" />
                  </button>
                </div>
              </div>
              <div className="flex gap-3 flex-wrap pt-2">
                <Button variant="outline" size="sm" onClick={() => toast.success('Cache cleared (mock)')}>Clear Cache</Button>
                <Button variant="outline" size="sm" onClick={() => toast.success('Backup initiated (mock)')}>Backup Database</Button>
                <Button variant="destructive" size="sm" onClick={() => toast.error('Factory reset requires confirmation')}>Factory Reset</Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end">
          <Button onClick={handleSave}>
            <Save className="w-4 h-4 mr-2" /> Save Settings
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default SystemSettings;
