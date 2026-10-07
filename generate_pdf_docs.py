import sys
import os
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to dynamically compute and render total page count
    along with professional running headers and footers.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        width, height = self._pagesize
        
        # Suppress header on cover page (page 1)
        if self._pageNumber > 1:
            self.setFont("Helvetica-Bold", 8)
            self.setFillColor(colors.HexColor("#475569"))
            self.drawString(40, height - 30, "DWIELD PASSKEY SERVER")
            self.setFont("Helvetica", 8)
            self.setFillColor(colors.HexColor("#64748B"))
            self.drawString(160, height - 30, "|  API Specification & Integration Reference")
            self.drawRightString(width - 40, height - 30, "v0.1.0 (Phase 1–6 Complete)")
            
            self.setStrokeColor(colors.HexColor("#CBD5E1"))
            self.setLineWidth(0.75)
            self.line(40, height - 36, width - 40, height - 36)
        
        # Footer on all pages
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.75)
        self.line(40, 45, width - 40, 45)
        
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        self.drawString(40, 32, "Confidential — Dwield Security Systems © 2026")
        
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(width - 40, 32, page_text)
        
        self.restoreState()

def build_pdf(filename):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=40,
        rightMargin=40,
        topMargin=48,
        bottomMargin=55
    )

    styles = getSampleStyleSheet()

    # Custom styles
    c_primary = colors.HexColor("#0F172A")
    c_blue = colors.HexColor("#2563EB")
    c_slate = colors.HexColor("#475569")
    c_dark = colors.HexColor("#1E293B")
    c_bg_light = colors.HexColor("#F8FAFC")
    c_border = colors.HexColor("#E2E8F0")

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=c_primary,
        spaceAfter=6
    )

    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=c_blue,
        spaceAfter=15
    )

    h1_style = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=19,
        textColor=c_primary,
        spaceBefore=16,
        spaceAfter=8,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'Heading2_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=15,
        textColor=c_dark,
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=c_slate,
        spaceAfter=8
    )

    bullet_style = ParagraphStyle(
        'Bullet_Custom',
        parent=body_style,
        leftIndent=12,
        spaceAfter=4
    )

    code_style = ParagraphStyle(
        'Code_Custom',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#0F172A"),
        spaceBefore=4,
        spaceAfter=4
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.white
    )

    table_body_style = ParagraphStyle(
        'TableBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.5,
        textColor=c_dark
    )

    table_code_style = ParagraphStyle(
        'TableCode',
        parent=styles['Normal'],
        fontName='Courier-Bold',
        fontSize=8,
        leading=10.5,
        textColor=c_blue
    )

    story = []

    # ---------------------------------------------------------
    # COVER / HEADER BLOCK
    # ---------------------------------------------------------
    story.append(Paragraph("Dwield Passkey Server API Specification", title_style))
    story.append(Paragraph("Production Integration & REST Endpoint Reference — v0.1.0", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=2, color=c_blue, spaceBefore=0, spaceAfter=12))

    # Meta Table Block
    meta_data = [
        [
            Paragraph("<b>Target Environment:</b> Production / Staging", body_style),
            Paragraph("<b>Auth Protocol:</b> WebAuthn (FIDO2 Level 2/3)", body_style)
        ],
        [
            Paragraph("<b>Tenant Auth:</b> SHA-256 API Key Header", body_style),
            Paragraph("<b>Identity Auth:</b> Customer Signed JWT / HMAC", body_style)
        ],
        [
            Paragraph("<b>Base URL:</b> <code>https://passkeys.dwield.com/v1</code>", body_style),
            Paragraph("<b>Service Version:</b> 0.1.0 (Phases 1–6 Implemented)", body_style)
        ]
    ]
    meta_table = Table(meta_data, colWidths=[260, 272])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), c_bg_light),
        ('BOX', (0, 0), (-1, -1), 1, c_border),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, c_border),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 14))

    # ---------------------------------------------------------
    # SECTION 1: ARCHITECTURE OVERVIEW
    # ---------------------------------------------------------
    story.append(Paragraph("1. System Architecture & Core Security Principles", h1_style))
    story.append(Paragraph(
        "The <b>Dwield Passkey Server</b> is a high-performance, multi-tenant WebAuthn authentication and adaptive step-up service. "
        "It acts as an independent cryptographic verification engine for customer applications. Dwield does not directly calculate "
        "user risk scores nor does it act as a primary identity provider; instead, customer backends maintain identity ownership and final access control.",
        body_style
    ))

    arch_bullets = [
        "<b>Multi-Tenant API Isolation:</b> Customers are isolated into tenants identified by SHA-256 hashed API keys.",
        "<b>Decoupled Identity Context:</b> End-user identity is established via customer-signed JWTs or HMAC identity tokens.",
        "<b>Atomic Single-Use Challenges:</b> WebAuthn challenges and step-up tokens enforce strict single-use redemption with automatic MongoDB TTL cleanup.",
        "<b>Adaptive Step-Up Binding:</b> Risk assessments requiring <code>STEP_UP</code> are cryptographically bound to specific users, tenants, and sessions.",
        "<b>Zero Secret Exposure:</b> Public keys (COSE format) are stored server-side. Private keys never leave user devices."
    ]
    for b in arch_bullets:
        story.append(Paragraph(f"• {b}", bullet_style))

    story.append(Spacer(1, 10))

    # ---------------------------------------------------------
    # SECTION 2: AUTHENTICATION & HEADERS
    # ---------------------------------------------------------
    story.append(Paragraph("2. Request Headers & Authentication Model", h1_style))
    story.append(Paragraph(
        "All API endpoints require tenant authentication via an API Key. Endpoints performing user-level ceremonies "
        "also require a validated User Identity Context Token.", body_style
    ))

    headers_table_data = [
        [Paragraph("Header Name", table_header_style), Paragraph("Type", table_header_style), Paragraph("Required", table_header_style), Paragraph("Description & Specification", table_header_style)],
        [
            Paragraph("X-API-Key", table_code_style),
            Paragraph("String", table_body_style),
            Paragraph("Yes", table_body_style),
            Paragraph("Dwield-issued API Key (e.g. <code>dw_live_pub_...</code>). Validated via SHA-256 lookup.", table_body_style)
        ],
        [
            Paragraph("X-Dwield-User-Token", table_code_style),
            Paragraph("String", table_body_style),
            Paragraph("Conditional", table_body_style),
            Paragraph("Customer-issued user context token. Accepts JWT (<code>sub</code>, <code>tenantId</code>, <code>exp</code>) or HMAC format.", table_body_style)
        ],
        [
            Paragraph("Content-Type", table_code_style),
            Paragraph("String", table_body_style),
            Paragraph("Yes", table_body_style),
            Paragraph("Must be <code>application/json</code> for all POST/DELETE requests.", table_body_style)
        ]
    ]

    headers_table = Table(headers_table_data, colWidths=[120, 65, 60, 287])
    headers_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), c_primary),
        ('GRID', (0, 0), (-1, -1), 0.5, c_border),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(headers_table)
    story.append(Spacer(1, 14))

    # ---------------------------------------------------------
    # SECTION 3: ENDPOINT REFERENCE
    # ---------------------------------------------------------
    story.append(Paragraph("3. Complete Endpoint Reference", h1_style))

    # Helper function to render formatted endpoint block
    def make_endpoint_block(method, path, title, description, headers_req, body_req, resp_success, resp_code, error_codes):
        blocks = []
        
        # Method color badge
        m_color = "#2563EB" if method == "POST" else ("#059669" if method == "GET" else "#DC2626")
        
        header_p = Paragraph(
            f"<font color='{m_color}'><b>[{method}]</b></font> &nbsp; <b><font size=10 fontName='Courier-Bold'>{path}</font></b> &nbsp; — &nbsp; {title}",
            h2_style
        )
        blocks.append(header_p)
        blocks.append(Paragraph(description, body_style))

        table_data = [
            [Paragraph("Field / Section", table_header_style), Paragraph("Specification & Sample Details", table_header_style)],
            [Paragraph("Headers Required", table_body_style), Paragraph(headers_req, table_body_style)],
            [Paragraph("Request Body", table_body_style), Paragraph(f"<font fontName='Courier'>{body_req}</font>", table_body_style)],
            [Paragraph(f"Response ({resp_code})", table_body_style), Paragraph(f"<font fontName='Courier'>{resp_success}</font>", table_body_style)],
            [Paragraph("Possible Errors", table_body_style), Paragraph(error_codes, table_body_style)],
        ]

        ep_table = Table(table_data, colWidths=[110, 422])
        ep_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), c_dark),
            ('GRID', (0, 0), (-1, -1), 0.5, c_border),
            ('BACKGROUND', (0, 1), (0, -1), c_bg_light),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ]))
        blocks.append(ep_table)
        blocks.append(Spacer(1, 10))
        return KeepTogether(blocks)

    # --- Endpoint 1: Registration Options ---
    story.append(make_endpoint_block(
        "POST", "/v1/passkeys/registration/options",
        "Generate Passkey Registration Options",
        "Initiates a WebAuthn passkey registration ceremony. Generates a cryptographically random challenge, populates excluded credentials, and returns standard FIDO2 options.",
        "<code>X-API-Key</code>, <code>X-Dwield-User-Token</code>",
        "{ \"userName\": \"alex_dev\", \"userDisplayName\": \"Alex Dev\" }",
        "{ \"status\": \"success\", \"ceremonyId\": \"cer_reg_9a8f...\", \"options\": { \"rp\": { \"name\": \"Acme\", \"id\": \"acme.com\" }, \"challenge\": \"d34a...\", \"userID\": \"...\" } }",
        "200 OK",
        "<code>401 UNAUTHORIZED</code> (Missing/Invalid key or token), <code>403 FORBIDDEN</code> (Tenant mismatch/suspended)."
    ))

    # --- Endpoint 2: Registration Verify ---
    story.append(make_endpoint_block(
        "POST", "/v1/passkeys/registration/verify",
        "Verify & Save Registered Passkey",
        "Verifies the authenticator's WebAuthn registration response. Validates challenge, origin, RP ID, and user verification. Saves the COSE public key in MongoDB.",
        "<code>X-API-Key</code>, <code>X-Dwield-User-Token</code>",
        "{ \"ceremonyId\": \"cer_reg_9a8f...\", \"response\": { \"id\": \"cred_123\", \"rawId\": \"...\", \"response\": { \"attestationObject\": \"...\", \"clientDataJSON\": \"...\" }, \"type\": \"public-key\" }, \"friendlyName\": \"MacBook TouchID\" }",
        "{ \"status\": \"success\", \"verified\": true, \"credentialId\": \"cred_123\", \"friendlyName\": \"MacBook TouchID\", \"createdAt\": \"2026-09-30T09:00:00Z\" }",
        "200 OK",
        "<code>400 VALIDATION_ERROR</code> (Invalid assertion signature/expired challenge), <code>401 UNAUTHORIZED</code>."
    ))

    # --- Endpoint 3: Authentication Options ---
    story.append(make_endpoint_block(
        "POST", "/v1/passkeys/authentication/options",
        "Generate Passkey Authentication Options",
        "Generates WebAuthn authentication options for active credentials belonging to the user. Supports optional binding to a step-up session and risk assessment.",
        "<code>X-API-Key</code>, <code>X-Dwield-User-Token</code>",
        "{ \"assessmentId\": \"asm_risk_771\", \"stepUpSessionId\": \"step_sess_441\" }",
        "{ \"status\": \"success\", \"ceremonyId\": \"cer_auth_811...\", \"options\": { \"challenge\": \"k92a...\", \"rpId\": \"acme.com\", \"allowCredentials\": [{ \"id\": \"cred_123\", \"type\": \"public-key\" }] } }",
        "200 OK",
        "<code>404 NOT_FOUND</code> (No active passkeys), <code>400 VALIDATION_ERROR</code> (Invalid step-up session/mismatched assessment)."
    ))

    # --- Endpoint 4: Authentication Verify ---
    story.append(make_endpoint_block(
        "POST", "/v1/passkeys/authentication/verify",
        "Verify WebAuthn Authentication Assertion",
        "Verifies the browser's assertion response against the stored COSE public key. Increments signature counter, updates last used timestamp, and issues a signed Step-Up Token.",
        "<code>X-API-Key</code>, <code>X-Dwield-User-Token</code>",
        "{ \"ceremonyId\": \"cer_auth_811...\", \"response\": { \"id\": \"cred_123\", \"rawId\": \"...\", \"response\": { \"authenticatorData\": \"...\", \"clientDataJSON\": \"...\", \"signature\": \"...\" }, \"type\": \"public-key\" } }",
        "{ \"status\": \"success\", \"verified\": true, \"tenantId\": \"tenant_acme\", \"userId\": \"usr_1001\", \"credentialId\": \"cred_123\", \"stepUpToken\": \"eyJqd...\" }",
        "200 OK",
        "<code>401 UNAUTHORIZED</code> (Passkey revoked or signature failure), <code>400 VALIDATION_ERROR</code> (Challenge expired/replayed)."
    ))

    # --- Endpoint 5: List Credentials ---
    story.append(make_endpoint_block(
        "GET", "/v1/passkeys",
        "List Active User Passkeys",
        "Retrieves metadata for all active passkeys registered under the authenticated user identity for the current tenant.",
        "<code>X-API-Key</code>, <code>X-Dwield-User-Token</code>",
        "N/A (Query Parameters optional)",
        "{ \"status\": \"success\", \"count\": 1, \"credentials\": [{ \"credentialId\": \"cred_123\", \"friendlyName\": \"MacBook TouchID\", \"deviceType\": \"singleDevice\", \"backedUp\": false, \"lastUsedAt\": \"2026-09-30T09:15:00Z\", \"createdAt\": \"2026-09-30T09:00:00Z\" }] }",
        "200 OK",
        "<code>401 UNAUTHORIZED</code>."
    ))

    # --- Endpoint 6: Revoke Credential ---
    story.append(make_endpoint_block(
        "DELETE", "/v1/passkeys/:credentialId",
        "Revoke Passkey Credential",
        "Sets the credential status to <code>revoked</code> in MongoDB. Revoked passkeys immediately fail future authentication option generation and verification.",
        "<code>X-API-Key</code>, <code>X-Dwield-User-Token</code>",
        "N/A (credentialId passed as URL parameter)",
        "{ \"status\": \"success\", \"message\": \"Passkey credential successfully revoked\", \"credentialId\": \"cred_123\" }",
        "200 OK",
        "<code>403 FORBIDDEN</code> (User does not own credential), <code>404 NOT_FOUND</code> (Credential ID not found)."
    ))

    # --- Endpoint 7: Step-Up Initiate ---
    story.append(make_endpoint_block(
        "POST", "/v1/step-up/initiate",
        "Initiate Adaptive Step-Up Session",
        "Creates a short-lived Step-Up Session (status <code>PENDING</code>). Validates risk assessment with the Risk Engine and rejects <code>DENY</code> decisions.",
        "<code>X-API-Key</code>, <code>X-Dwield-User-Token</code>",
        "{ \"assessmentId\": \"asm_risk_771\" }",
        "{ \"status\": \"success\", \"session\": { \"stepUpSessionId\": \"step_sess_441\", \"tenantId\": \"tenant_acme\", \"userId\": \"usr_1001\", \"assessmentId\": \"asm_risk_771\", \"status\": \"PENDING\", \"expiresAt\": \"2026-09-30T09:20:00Z\" } }",
        "201 Created",
        "<code>403 FORBIDDEN</code> (Step-up forbidden for DENY risk decisions), <code>401 UNAUTHORIZED</code>."
    ))

    # --- Endpoint 8: Verify Step-Up Token ---
    story.append(make_endpoint_block(
        "POST", "/v1/step-up/verify-token",
        "Verify Signed Step-Up Token (Backend-to-Backend)",
        "Called by the Customer Backend to verify the signed HMAC Step-Up Token. Atomically consumes token to prevent replay attacks and marks Step-Up Session as <code>CONSUMED</code>.",
        "<code>X-API-Key</code>",
        "{ \"token\": \"eyJqd...\", \"expectedUserId\": \"usr_1001\", \"expectedAssessmentId\": \"asm_risk_771\", \"expectedStepUpSessionId\": \"step_sess_441\" }",
        "{ \"status\": \"success\", \"valid\": true, \"payload\": { \"jti\": \"stk_911...\", \"iss\": \"dwield-passkey-server\", \"sub\": \"usr_1001\", \"tenantId\": \"tenant_acme\", \"credentialId\": \"cred_123\", \"assessmentId\": \"asm_risk_771\", \"stepUpSessionId\": \"step_sess_441\", \"exp\": 1790717340 } }",
        "200 OK",
        "<code>409 CONFLICT</code> (Replay attempt: token already consumed), <code>401 UNAUTHORIZED</code> (Signature invalid/mismatched identity)."
    ))

    # --- Endpoint 9: Health & Readiness ---
    story.append(make_endpoint_block(
        "GET", "/health/ready",
        "Readiness & DB Health Probe",
        "Used by load balancers and Kubernetes readiness probes to verify database connectivity.",
        "None",
        "N/A",
        "{ \"status\": \"ready\", \"database\": \"connected\", \"timestamp\": \"2026-09-30T09:25:00Z\" }",
        "200 OK",
        "<code>503 SERVICE_UNAVAILABLE</code> (Database disconnected)."
    ))

    # ---------------------------------------------------------
    # SECTION 4: ERROR HANDLING & CODES
    # ---------------------------------------------------------
    story.append(Spacer(1, 6))
    story.append(Paragraph("4. Standard Error Handling & Status Codes", h1_style))
    story.append(Paragraph(
        "All error responses adhere to a uniform JSON error structure across all endpoints.", body_style
    ))

    error_json = (
        "{\n"
        "  \"error\": {\n"
        "    \"code\": \"UNAUTHORIZED\",\n"
        "    \"message\": \"Invalid user context token signature\",\n"
        "    \"details\": []\n"
        "  }\n"
        "}"
    )
    story.append(Paragraph(f"<font fontName='Courier' size=8 color='#1E293B'>{error_json.replace('\n', '<br/>').replace(' ', '&nbsp;')}</font>", body_style))

    error_table_data = [
        [Paragraph("HTTP Status", table_header_style), Paragraph("Error Code", table_header_style), Paragraph("Description & Trigger Condition", table_header_style)],
        [Paragraph("400 Bad Request", table_body_style), Paragraph("VALIDATION_ERROR / BAD_REQUEST", table_code_style), Paragraph("Zod schema validation failure, malformed JSON, or expired WebAuthn challenge.", table_body_style)],
        [Paragraph("401 Unauthorized", table_body_style), Paragraph("UNAUTHORIZED", table_code_style), Paragraph("Missing/invalid API key, missing/invalid user token, signature check failed, or revoked credential.", table_body_style)],
        [Paragraph("403 Forbidden", table_body_style), Paragraph("FORBIDDEN", table_code_style), Paragraph("Tenant mismatch between API key and user token, or step-up initiation for DENY decision.", table_body_style)],
        [Paragraph("404 Not Found", table_body_style), Paragraph("NOT_FOUND", table_code_style), Paragraph("No active credentials found for user, or requested endpoint path does not exist.", table_body_style)],
        [Paragraph("409 Conflict", table_body_style), Paragraph("CONFLICT", table_code_style), Paragraph("Replay attempt detected when redeeming single-use Step-Up Verification Token.", table_body_style)],
        [Paragraph("503 Service Unavailable", table_body_style), Paragraph("SERVICE_UNAVAILABLE", table_code_style), Paragraph("Readiness probe failure due to MongoDB disconnect.", table_body_style)]
    ]

    error_table = Table(error_table_data, colWidths=[105, 140, 287])
    error_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), c_primary),
        ('GRID', (0, 0), (-1, -1), 0.5, c_border),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(error_table)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated API documentation PDF: {filename}")

if __name__ == '__main__':
    out_pdf = os.path.join(os.getcwd(), 'Dwield_Passkey_Server_API_Documentation.pdf')
    build_pdf(out_pdf)
