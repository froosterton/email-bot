import smtplib
import ssl
import sys
import random
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

SMTP_SERVER = "smtp.mail.yahoo.com"
SMTP_PORT = 465

# -----------------------------------------
# SUBJECT + BODY APPROACHES
# -----------------------------------------

SUBJECT_TEMPLATES = [
    "Quick question about your Roblox account, {username}",
    "Are you open to selling your Roblox account, {username}?",
    "Hi {username}, would you ever sell your Roblox account?",
    "Interested in buying your Roblox account, {username}",
    "Question about your Roblox account and {top_item}",
    "Saw your Roblox account {username} and had a quick question",
    "Would you consider selling the account with \"{top_item}\"?",
    "Just reaching out about your Roblox account, {username}",
    "Small question about your account and your limiteds",
    "Wondering if you'd sell your Roblox account, {username}"
]

BODY_TEMPLATES = [
    """Hi {username},

I came across your Roblox account and saw that you own the limited "{top_item}".
I was wondering if you might be interested in selling the account.

If you’re open to talking, you can reply here and we can discuss details.

Discord: 1nathanx
Phone: (703)-828-4353

Thanks!
""",
    """Hey {username},

Sorry to bother you, but I noticed your Roblox account has the limited "{top_item}".
Would you ever consider selling the account that owns it?

If you are interested, feel free to reply to this email.

Discord: 1nathanx
Phone: (703)-828-4353

Thank you.
""",
    """Hello {username},

I’m reaching out because I saw your Roblox account and the limited "{top_item}".
I’m looking to buy an account like yours and wanted to see if you’d be open to selling.

If this is something you’d consider, you can reply here to talk more.

Discord: 1nathanx
Phone: (703)-828-4353

Best,
Maddox
""",
    """Hi {username},

I hope this isn’t too random, but I saw that your Roblox account owns "{top_item}".
I’m interested in buying Roblox accounts and wanted to ask if you’d sell yours.

If you’re not interested, no worries at all. If you are, just reply here.

Discord: 1nathanx
Phone: (703)-828-4353
""",
    """Hey {username},

Just a quick message — I noticed your Roblox account has the limited "{top_item}".
Would you be open to selling that account for a reasonable price?

If so, you can reply to this email so we can talk numbers.

Discord: 1nathanx
Phone: (703)-828-4353
""",
    """Hello {username},

I found your Roblox account and saw you own "{top_item}".
I’m currently buying Roblox accounts and wanted to check if you’d ever think about selling yours.

If this sounds interesting, feel free to reply back.

Discord: 1nathanx
Phone: (703)-828-4353

Regards,
Maddox
""",
    """Hi {username},

I came across your Roblox account with the limited "{top_item}" and was curious
if you’d consider selling the account.

If you’re open to it, you can reply here and we can discuss it more.

Discord: 1nathanx
Phone: (703)-828-4353
""",
    """Hey {username},

I hope you don’t mind me reaching out. I noticed your Roblox account includes "{top_item}".
I’m interested in buying an account like that and wanted to see if you’d be willing to sell.

If not, that’s totally fine. If yes, just send a reply.

Discord: 1nathanx
Phone: (703)-828-4353
""",
    """Hello {username},

I saw your Roblox account and the limited "{top_item}" on it.
I’ve been looking to buy a Roblox account with similar items and thought I’d ask if selling is an option for you.

If you’d like to talk, you can reply to this email.

Discord: 1nathanx
Phone: (703)-828-4353

Thanks,
Maddox
""",
    """Hi {username},

This might be a bit unexpected, but I noticed your Roblox account owns "{top_item}".
I’m interested in buying Roblox accounts and was wondering if you’d consider selling yours.

If you are open to chatting about it, please reply here when you have time.

Discord: 1nathanx
Phone: (703)-828-4353
"""
]


def send_yahoo_email(from_email, app_password, to_email, username, top_item):
    subject_template = random.choice(SUBJECT_TEMPLATES)
    body_template = random.choice(BODY_TEMPLATES)

    subject = subject_template.format(username=username, top_item=top_item)
    body = body_template.format(username=username, top_item=top_item)

    msg = MIMEMultipart()
    msg["From"] = from_email
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    context = ssl.create_default_context()
    try:
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, context=context) as server:
            server.login(from_email, app_password)
            server.sendmail(from_email, to_email, msg.as_string())
            print(f"Email handed off from {from_email} → {to_email}")
            return True
    except Exception as e:
        print("[Yahoo SMTP error]:", e)
        return False


if __name__ == "__main__":
    if len(sys.argv) < 6:
        print("Usage: send_email.py <fromEmail> <appPassword> <toEmail> <username> <topItem>")
        sys.exit(1)

    from_email = sys.argv[1]
    app_password = sys.argv[2]
    to_email = sys.argv[3]
    username = sys.argv[4]
    top_item = sys.argv[5]

    ok = send_yahoo_email(from_email, app_password, to_email, username, top_item)
    sys.exit(0 if ok else 1)
