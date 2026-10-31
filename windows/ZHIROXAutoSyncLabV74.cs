// Native Windows GUI EXE: V74 isolated AutoSync LAB CONTROL only.
// This is NOT the cashier and CANNOT turn V55 preview into a production POS.
// V49 checks loopback receiver + disposable local PostgreSQL before sync starts.
using System;
using System.Drawing;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class ZhiroxAutoSyncLab {
    private static string Dir { get { return AppDomain.CurrentDomain.BaseDirectory; } }

    private static bool PackageSafe() {
        return File.Exists(Path.Combine(Dir, "node.exe")) &&
            File.Exists(Path.Combine(Dir, "offline", "autosync-v49.mjs")) &&
            File.Exists(Path.Combine(Dir, "offline", "outbox-sync-worker-v27.mjs")) &&
            File.Exists(Path.Combine(Dir, "node_modules", "pg", "package.json"));
    }

    private static bool IsLabOptedIn() {
        if (!PackageSafe()) return false;
        if (Environment.GetEnvironmentVariable("ZHIROX_RELEASE_MODE") == "official") return false;
        if (Environment.GetEnvironmentVariable("ZHIROX_V49_LAB_AUTOSYNC_ENABLED") != "true" ||
            Environment.GetEnvironmentVariable("ZHIROX_V27_TEST_MODE") != "true") return false;
        // V49 independently verifies real URL host, loopback receiver, database suffix,
        // UUID and minimum HMAC secret length; do not duplicate or weaken it here.
        return true;
    }

    [STAThread]
    private static int Main(string[] args) {
        if (args.Length == 1 && args[0] == "--self-test")
            return PackageSafe() && !IsLabOptedIn() ? 0 : 5;
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new SyncWindow());
        return 0;
    }

    private sealed class SyncWindow : Form {
        private Process worker;
        private readonly Label status;
        private readonly Button start;
        private readonly Button stop;

        public SyncWindow() {
            Text = "ZHIROX371 AutoSync — LAB ONLY";
            Width = 620; Height = 295;
            MinimumSize = new Size(590, 280);
            StartPosition = FormStartPosition.CenterScreen;
            RightToLeft = RightToLeft.Yes;
            RightToLeftLayout = true;
            BackColor = Color.White;
            Controls.Add(new Label {
                Left = 20, Top = 24, Width = 565, Height = 45,
                Text = "سوپەرمارکێتی کانی چنار — AutoSync LAB",
                Font = new Font("Tahoma", 14, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleCenter
            });
            Controls.Add(new Label {
                Left = 20, Top = 78, Width = 565, Height = 40,
                ForeColor = Color.DarkRed,
                Text = "تەنها تاقیکردنەوەی داتابەیسی جیاکراوە — نەک فرۆشتنی ڕاستەقینە",
                TextAlign = ContentAlignment.MiddleCenter
            });
            status = new Label {
                Left = 20, Top = 133, Width = 565, Height = 36,
                Text = "AutoSync وەستاوە",
                TextAlign = ContentAlignment.MiddleCenter
            };
            start = new Button { Left = 326, Top = 184, Width = 160, Height = 40,
                Text = "دەستپێکردنی Sync" };
            stop = new Button { Left = 136, Top = 184, Width = 160, Height = 40,
                Text = "وەستاندنی Sync", Enabled = false };
            start.Click += (s,e)=>StartWorker();
            stop.Click += (s,e)=>StopWorker();
            Controls.Add(status); Controls.Add(start); Controls.Add(stop);
            FormClosing += (s,e)=>StopWorker();
        }

        private void StartWorker() {
            if (worker != null && !worker.HasExited) return;
            if (!IsLabOptedIn()) {
                status.Text = "ڕەتکرایەوە: هەژماری LAB و ژینگەی جیاکراوە پێویستە";
                MessageBox.Show(this,
                    "AutoSync LAB cannot run unless explicitly opted into a disposable local test database. The actual V49 worker validates configuration again. Production or remote destinations are denied.",
                    "Safety gate", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            try {
                var node = Path.Combine(Dir,"node.exe");
                var script = Path.Combine(Dir,"offline","autosync-v49.mjs");
                worker = new Process();
                worker.StartInfo = new ProcessStartInfo(node) {
                    Arguments = "\"" + script + "\"",
                    WorkingDirectory = Dir,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };
                worker.EnableRaisingEvents = true;
                worker.Exited += (sender,args)=>{
                    if (!IsDisposed && IsHandleCreated) {
                        BeginInvoke(new Action(()=>{
                            status.Text = "Sync وەستا؛ ئاگادارییەکان بپشکنە";
                            start.Enabled = true;
                            stop.Enabled = false;
                        }));
                    }
                };
                worker.OutputDataReceived += (sender,args)=>{
                    if (args.Data != null && !IsDisposed && IsHandleCreated &&
                        args.Data.Length < 1000) BeginInvoke(new Action(()=>{
                            // Never display secrets or payload from this third-party process:
                            // operational V49 status only, with no raw message echoed.
                            status.Text = "دۆخی Sync ـی تاقیکردنەوە نوێکرایەوە";
                        }));
                };
                worker.ErrorDataReceived += (sender,args)=>{
                    if(args.Data != null && !IsDisposed && IsHandleCreated)
                        BeginInvoke(new Action(()=>status.Text="هەڵەی Sync؛ پەیوەندی/ڕێکخستن بپشکنە"));
                };
                if (!worker.Start()) throw new InvalidOperationException("Node launch refused");
                worker.BeginOutputReadLine();
                worker.BeginErrorReadLine();
                start.Enabled = false; stop.Enabled = true;
                status.Text = "Sync LAB کار دەکات؛ فرۆشتنی ڕاستەقینە چالاک نییە";
            } catch(Exception) {
                status.Text = "Sync دەستی پێنەکرد — هیچ داتایەک نەگۆڕدرا";
                start.Enabled = true; stop.Enabled = false;
            }
        }

        private void StopWorker() {
            if (worker == null) return;
            try { if(!worker.HasExited) worker.Kill(); } catch {}
            try { worker.Dispose(); } catch {}
            worker = null; start.Enabled = true; stop.Enabled = false;
            status.Text = "Sync LAB وەستا";
        }
    }
}
