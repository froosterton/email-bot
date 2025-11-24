# send_email.py
import os
import smtplib
import ssl
import sys
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

YAHOO_EMAIL = os.environ.get("YAHOO_EMAIL")
YAHOO_APP_PASSWORD = os.environ.get("YAHOO_APP_PASSWORD")
CONTACT_DISCORD = os.environ.get("CONTACT_DISCORD", "1nathanx")
CONTACT_PHONE = os.environ.get("CONTACT_PHONE", "(703) 828-4353")

SMTP_SERVER = "smtp.mail.yahoo.com"
SMTP_PORT = 465


def send_yahoo_email(to_email: str, username: str, top_item: str) -> bool:
    if not YAHOO_EMAIL or not YAHOO_APP_PASSWORD:
        print("Missing YAHOO_EMAIL or YAHOO_APP_PASSWORD environment variables.")
        return False

    subject = f"Quick question about your Roblox account, {username}"

    body = f"""Hello, I'm hoping you're the owner of the Roblox account {username}.

I saw you had some interesting items on the account such as {top_item} and I'd be willing to buy it from you for a reasonable price.

You can simply reply here or contact me with any of the methods below!

Discord: {CONTACT_DISCORD}
Phone: {CONTACT_PHONE}
"""

    msg = MIMEMultipart()
    msg["From"] = YAHOO_EMAIL
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    context = ssl.create_default_context()
    try:
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, context=context) as server:
            server.login(YAHOO_EMAIL, YAHOO_APP_PASSWORD)
            server.sendmail(YAHOO_EMAIL, to_email, msg.as_string())
            print("Email handed off to Yahoo SMTP (accepted).")
            return True
    except Exception as e:
        print("[Yahoo] SMTP error:", e)
        return False


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: send_email.py <email> <username> <topItem>")
        sys.exit(1)

    to_email = sys.argv[1]
    username = sys.argv[2]
    top_item = sys.argv[3]

    ok = send_yahoo_email(to_email, username, top_item)
    sys.exit(0 if ok else 1)
