// ZHIROX371 V55 — genuine Win32 EXE entry point, not a README/PowerShell shortcut.
// C# WinForms desktop controller starts a read-only local Node preview and
// automatically opens the real bundled offline cashier UI in Edge/Chrome app mode.
// No production database, real sales, payments, automatic cloud or printer jobs.
using System;
using System.IO;
using System.Net;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;
using System.Threading;
using System.Threading.Tasks;

internal static class ZhiroxLauncher
{
    private const string PreviewUrl = "http://127.0.0.1:3555";
    private static Process ownedNode;

    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "--self-test")
        {
            try { return RunSelfTest(); }
            finally { StopOwnedNode(); }
        }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new Window());
        StopOwnedNode();
        return 0;
    }

    private static bool IsVerifiedPreview()
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(PreviewUrl + "/__zhirox_preview_health");
            req.Proxy = null;
            req.Method = "GET";
            req.Timeout = 1000;
            req.ReadWriteTimeout = 1000;
            req.AllowAutoRedirect = false;
            using (var response = (HttpWebResponse)req.GetResponse())
            using (var stream = new StreamReader(response.GetResponseStream()))
            {
                var data = stream.ReadToEnd();
                return response.StatusCode == HttpStatusCode.OK
                    && data.Contains("\"app\":\"ZHIROX371\"")
                    && data.Contains("\"mode\":\"OFFLINE_PREVIEW_ONLY\"")
                    && data.Contains("\"live_sales\":false");
            }
        }
        catch { return false; }
    }

    private static void StartNodeIfNeeded()
    {
        if (IsVerifiedPreview()) return;
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        string runtime = Path.Combine(dir, "node.exe");
        string server = Path.Combine(dir, "offline", "standalone-preview-v55.mjs");
        string manifest = Path.Combine(dir, "dist", "pilot-manifest-v36.json");
        if (!File.Exists(runtime) || !File.Exists(server) || !File.Exists(manifest))
            throw new InvalidOperationException("Files missing. Reinstall ZHIROX371 V55 offline preview.");
        if (Environment.GetEnvironmentVariable("ZHIROX_RELEASE_MODE") == "official")
            throw new InvalidOperationException("Official sales are not approved in the V55 preview.");
        var psi = new ProcessStartInfo(runtime);
        psi.Arguments = "\"" + server + "\"";
        psi.WorkingDirectory = dir;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.WindowStyle = ProcessWindowStyle.Hidden;
        ownedNode = Process.Start(psi);
        if (ownedNode == null) throw new InvalidOperationException("Unable to start local preview server.");
    }

    private static bool AwaitVerifiedPreview()
    {
        for (int i = 0; i < 24; i++)
        {
            if (IsVerifiedPreview()) return true;
            if (ownedNode != null && ownedNode.HasExited) return false;
            Thread.Sleep(250);
        }
        return false;
    }

    private static void StopOwnedNode()
    {
        try { if (ownedNode != null && !ownedNode.HasExited) ownedNode.Kill(); }
        catch { }
        try { if (ownedNode != null) ownedNode.Dispose(); }
        catch { }
        ownedNode = null;
    }

    private static int RunSelfTest()
    {
        try
        {
            StartNodeIfNeeded();
            if (!AwaitVerifiedPreview()) return 2;
            var request = (HttpWebRequest)WebRequest.Create(PreviewUrl + "/api/local/checkout");
            request.Proxy = null;
            request.Method = "POST";
            request.Timeout = 2000;
            request.AllowAutoRedirect = false;
            try
            {
                using (var resp = (HttpWebResponse)request.GetResponse()) return 3;
            }
            catch (WebException ex)
            {
                var resp = ex.Response as HttpWebResponse;
                if (resp == null || (int)resp.StatusCode != 405) return 4;
            }
            return 0;
        }
        catch { return 5; }
    }

    private static void OpenAppWindow()
    {
        string[] browsers = {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                "Google", "Chrome", "Application", "chrome.exe")
        };
        foreach (string browser in browsers)
        {
            if (!File.Exists(browser)) continue;
            Process.Start(new ProcessStartInfo(browser) {
                Arguments = "--app=\"" + PreviewUrl + "\" --no-first-run",
                UseShellExecute = false
            });
            return;
        }
        Process.Start(new ProcessStartInfo(PreviewUrl) { UseShellExecute = true });
    }

    private sealed class Window : Form
    {
        private readonly Label status;
        private readonly Button open;
        private bool opening;

        public Window()
        {
            Text = "ZHIROX371 — Offline PC";
            Width = 620; Height = 265;
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(560, 240);
            RightToLeft = RightToLeft.Yes;
            RightToLeftLayout = true;
            BackColor = Color.White;
            var heading = new Label {
                Left = 30, Top = 25, Width = 535, Height = 44,
                Text = "سوپەرمارکێتی کانی چنار — ZHIROX371",
                Font = new Font("Tahoma", 15, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleCenter
            };
            var warning = new Label {
                Left = 30, Top = 73, Width = 535, Height = 35,
                Text = "پێشبینینی ئۆفلاین — فرۆشتنی ڕاستەقینە ناچالاکە",
                ForeColor = Color.DarkRed,
                Font = new Font("Tahoma", 10, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleCenter
            };
            status = new Label {
                Left = 30, Top = 120, Width = 535, Height = 28,
                Text = "خزمەتگوزاری ناوخۆیی دەست پێ دەکات...",
                TextAlign = ContentAlignment.MiddleCenter
            };
            open = new Button {
                Left = 190, Top = 157, Width = 220, Height = 35,
                Text = "کردنەوەی ئەپ", Enabled = false
            };
            open.Click += async (sender, args) => await LaunchAsync();
            Controls.Add(heading); Controls.Add(warning); Controls.Add(status); Controls.Add(open);
            Shown += async (sender,args) => await LaunchAsync();
        }

        private async Task LaunchAsync()
        {
            if (opening) return;
            opening = true; open.Enabled = false;
            status.Text = "دەستپێکردنی ZHIROX371...";
            try
            {
                bool ready = await Task.Run(() => {
                    StartNodeIfNeeded();
                    return AwaitVerifiedPreview();
                });
                if (!ready) throw new InvalidOperationException(
                    "Local offline preview failed. Verify files or port 3555.");
                status.Text = "ئەپەکە بە شێوەی ناوخۆیی ئامادەیە (تەنها پێشبینین)";
                OpenAppWindow();
                open.Enabled = true;
                WindowState = FormWindowState.Minimized;
            }
            catch (Exception ex)
            {
                status.Text = "کێشەی کردنەوە — " + ex.Message;
                open.Enabled = true;
                MessageBox.Show(this,ex.Message,
                    "ZHIROX371 Offline Preview — not for real sales",
                    MessageBoxButtons.OK,MessageBoxIcon.Warning);
            }
            finally { opening = false; }
        }
    }
}
