// Genuine Windows WinForms V75 cashier. REAL V31 PostgreSQL-backed HTTPS
// prepare/commit only in an expressly configured DISPOSABLE TEST LAB.
// Separate from read-only V55 Preview, no production/live store authorization.
// TLS validation is ALWAYS on; never ignore certificate errors.
using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using System.Drawing;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using System.Collections.Generic;

internal static class ZhiroxCashierV75 {
  private static string Endpoint;
  private static JavaScriptSerializer Json = new JavaScriptSerializer();
  private static string Validate() {
    if(Environment.GetEnvironmentVariable("ZHIROX_V75_LAB_CASHIER_ENABLED")!="true"
       ||Environment.GetEnvironmentVariable("ZHIROX_RELEASE_MODE")=="official")
      throw new InvalidOperationException("Only opt-in disposable lab checkout is allowed");
    var str=Environment.GetEnvironmentVariable("ZHIROX_V75_GATEWAY_URL");
    Uri url;
    if(!Uri.TryCreate(str,UriKind.Absolute,out url)||url.Scheme!="https"||
      !url.IsLoopback||url.Port!=3433||url.AbsolutePath!="/"||
      !String.IsNullOrEmpty(url.Query)||!String.IsNullOrEmpty(url.Fragment)||
      !String.IsNullOrEmpty(url.UserInfo))
      throw new InvalidOperationException("Only verified loopback TLS gateway https://127.0.0.1:3433 permitted");
    return url.GetLeftPart(UriPartial.Authority);
  }
  private static async Task<Dictionary<string,object>> Api(
      string path,object body,string token=null) {
    var req=(HttpWebRequest)WebRequest.Create(Endpoint+path);
    req.Method="POST"; req.Proxy=null;req.AllowAutoRedirect=false;
    req.Timeout=8000;req.ReadWriteTimeout=8000;
    req.ContentType="application/json";
    if(!String.IsNullOrEmpty(token))req.Headers[HttpRequestHeader.Authorization]="Bearer "+token;
    var payload=Encoding.UTF8.GetBytes(Json.Serialize(body));
    req.ContentLength=payload.Length;
    using(var stream=await req.GetRequestStreamAsync())await stream.WriteAsync(payload,0,payload.Length);
    HttpWebResponse response;
    try{ response=(HttpWebResponse)await req.GetResponseAsync(); }
    catch(WebException e){
       response=e.Response as HttpWebResponse;
       if(response==null)throw new InvalidOperationException("LAN unavailable: checkout not confirmed. Recover the same request ID.");
    }
    using(response)using(var reader=new StreamReader(response.GetResponseStream())) {
      var msg=reader.ReadToEnd();
      var result=Json.Deserialize<Dictionary<string,object>>(msg);
      if((int)response.StatusCode>=400)
        throw new InvalidOperationException("Server rejected "+(int)response.StatusCode+
          ": "+(result.ContainsKey("error")?Convert.ToString(result["error"]):"unavailable"));
      return result;
    }
  }
  private static Dictionary<string,object> Nested(Dictionary<string,object> o,string k){
    return (Dictionary<string,object>)o[k];
  }
  [STAThread]private static int Main(string[] args){
    if(args.Length==1&&args[0]=="--self-test") {
      try { Validate();return 4; } catch { return 0; } // safe by default
    }
    Application.EnableVisualStyles();
    Application.SetCompatibleTextRenderingDefault(false);
    Application.Run(new Cashier());
    return 0;
  }
  private sealed class Cashier:Form{
    TextBox store,user,password,barcode,qty,expected;
    Label status;
    Button login,prepare,commit,recover;
    string token,requestId;
    public Cashier(){
      Text="ZHIROX371 V75 — کاشێری تاقیکردنەوە";Width=800;Height=535;
      MinimumSize=new Size(730,500);StartPosition=FormStartPosition.CenterScreen;
      RightToLeft=RightToLeft.Yes;RightToLeftLayout=true;
      BackColor=Color.White;
      int y=20;
      Controls.Add(new Label{Left=55,Top=y,Width=690,Height=40,
        Text="سوپەرمارکێتی کانی چنار — کاشێری ڕاستەقینەی SQL (تاقیکردنەوە)",
        Font=new Font("Tahoma",13,FontStyle.Bold),TextAlign=ContentAlignment.MiddleCenter});
      y=75;
      store=Field("Store UUID",ref y);
      user=Field("Cashier username",ref y);
      password=Field("Password",ref y);password.UseSystemPasswordChar=true;
      barcode=Field("Barcode",ref y);
      qty=Field("Quantity",ref y);qty.Text="1";
      expected=Field("Expected total IQD",ref y);
      login=Action("چوونەژوورەوە",590,365,async()=>await Login());
      prepare=Action("ئامادەکردنی فرۆشتن",420,365,async()=>await Prepare());
      commit=Action("تۆمارکردنی فرۆشتن",250,365,async()=>await Commit());
      recover=Action("گەڕاندنەوەی مامەڵە",80,365,async()=>await Recover());
      status=new Label{Left=38,Top=427,Width=700,Height=55,
        Text="تەنها PostgreSQL ـی تاقیکردنەوە؛ فرۆشتنی بازاڕ ڕێگەپێنەدراوە",
        ForeColor=Color.DarkRed,Font=new Font("Tahoma",10),TextAlign=ContentAlignment.MiddleCenter};
      Controls.Add(status);
      try{Endpoint=Validate();status.Text="HTTPS LAN ـی تاقیکردنەوە: "+Endpoint;}
      catch{status.Text="V75 ڕەتکرایەوە: پێویستی بە ڕێکخستنی تاقیکردنەوەی پارێزراوە";}
      SafeButtons();
    }
    TextBox Field(string label,ref int y) {
      Controls.Add(new Label{Left=505,Top=y+5,Width=225,Height=26,Text=label,
        TextAlign=ContentAlignment.MiddleRight});
      var t=new TextBox{Left=75,Top=y,Width=410,Height=27};
      Controls.Add(t);y+=45;return t;
    }
    Button Action(string text,int x,int y,Func<Task> action){
      var b=new Button{Left=x,Top=y,Width=153,Height=45,Text=text};
      b.Click+=async(s,e)=>{
        b.Enabled=false;
        try{await action();}
        catch(Exception ex){status.Text="وەستا: "+ex.Message;}
        finally{SafeButtons();}
      };Controls.Add(b);return b;
    }
    void SafeButtons(){
      bool ok=!String.IsNullOrEmpty(Endpoint);
      login.Enabled=ok;
      prepare.Enabled=ok&&!String.IsNullOrEmpty(token)&&requestId==null;
      commit.Enabled=ok&&!String.IsNullOrEmpty(token)&&requestId!=null;
      recover.Enabled=ok&&!String.IsNullOrEmpty(token);
    }
    async Task Login(){
      var id=Guid.Empty;
      if(!Guid.TryParse(store.Text.Trim(),out id))throw new Exception("Store UUID invalid");
      var r=await Api("/api/local/v3/login",new{
        store_id=id.ToString(),username=user.Text.Trim(),password=password.Text
      });
      token=Convert.ToString(r["token"]);requestId=null;
      if(String.IsNullOrEmpty(token))throw new Exception("No cashier session");
      status.Text="چوونەژوورەوە سەرکەوتوو بوو. بۆ فرۆشتن پێویستە شێفتێکی کراوەت هەبێت.";
      password.Clear();
    }
    async Task Prepare(){
      int quantity;long total;
      if(!int.TryParse(qty.Text,out quantity)||quantity<1||quantity>100||
       !long.TryParse(expected.Text,out total)||total<0||total>9999999999999L)
       throw new Exception("Quantity or expected price invalid");
      if(!System.Text.RegularExpressions.Regex.IsMatch(barcode.Text,@"^[A-Za-z0-9._-]{4,80}$"))
       throw new Exception("Invalid barcode");
      var id=Guid.NewGuid().ToString();
      // Store requestId BEFORE network I/O; never generate a new UUID on failure.
      requestId=id;
      status.Text="Prepare: "+id;
      var r=await Api("/api/local/v31/prepare",new{
        request_id=id,
        lines=new[]{new{barcode=barcode.Text,qty=quantity}},
        expected_total_minor=total
      },token);
      var intent=Nested(r,"intent");
      if(Convert.ToString(intent["state"])!="prepared")
        throw new Exception("Server did not prepare checkout");
      status.Text="ئامادەیە: "+id+" — دوای پشکنین تۆمارکردن دابگرە";
    }
    async Task Commit(){
      if(requestId==null)throw new Exception("No prepared checkout");
      var r=await Api("/api/local/v31/commit",new{request_id=requestId},token);
      var receipt=Nested(r,"receipt");
      status.Text="فرۆشتن تۆمار کرا: "+Convert.ToString(receipt["total_minor"])+" IQD — Receipt "+Convert.ToString(receipt["receipt_no"]);
      requestId=null;
    }
    async Task Recover(){
      // Existing V31 recovery is GET and authenticated — no fake green status.
      var req=(HttpWebRequest)WebRequest.Create(Endpoint+"/api/local/v31/recover");
      req.Method="GET";req.Proxy=null;req.Timeout=8000;
      req.Headers[HttpRequestHeader.Authorization]="Bearer "+token;
      using(var response=(HttpWebResponse)await req.GetResponseAsync())
      using(var reader=new StreamReader(response.GetResponseStream())){
        if(response.StatusCode!=HttpStatusCode.OK)throw new Exception("Cannot recover");
        var obj=Json.Deserialize<Dictionary<string,object>>(reader.ReadToEnd());
        if(obj["intent"]==null){requestId=null;status.Text="هیچ مامەڵەیەکی ناتەواو نەماوە";return;}
        var intent=(Dictionary<string,object>)obj["intent"];
        requestId=Convert.ToString(intent["request_id"]);
        status.Text="گەڕانەوەی مامەڵە: "+requestId;
      }
    }
  }
}
