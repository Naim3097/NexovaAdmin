# Onboarding Checklist — Website Creation

> Source of truth for the Website Creation onboarding form. The DB seed in `supabase/migrations/0002_seed_onboarding_templates.sql` mirrors this structure as `schema_json`.
>
> **Rule:** Build only begins upon full submission.

## 1. Business Information
- [ ] Business name & tagline
- [ ] Business registration number (SSM)
- [ ] Business address
- [ ] Phone number
- [ ] Email address
- [ ] Operating hours

## 2. Brand Assets
- [ ] Logo file (PNG or SVG, transparent background)
- [ ] Brand colours (hex codes)
- [ ] Preferred fonts / brand guide

## 3. Content
- [ ] About Us / company story (written out)
- [ ] Full list of services or products (name + description)
- [ ] Pricing (if to be displayed)
- [ ] Team member names, titles & short bios
- [ ] Customer testimonials (text + reviewer name)
- [ ] FAQ (questions + answers)

## 4. Media
- [ ] Professional photos (storefront, products, team)
- [ ] Videos (if any)

## 5. Design Preferences
- [ ] 1–3 reference websites you like
- [ ] Preferred style (modern, bold, minimal, warm, etc.)
- [ ] Main goal of the website (sell / leads / portfolio / info)

## 6. Technical
- [ ] Domain name (and login access if transferring)
- [ ] Existing hosting provider (if any)
- [ ] Facebook page URL
- [ ] Instagram URL
- [ ] TikTok URL
- [ ] Other social media links
- [ ] Google Business Profile link
- [ ] Third-party tools needed (booking, live chat, etc.)

## 7. Legal
- [ ] Privacy Policy (existing doc, or confirm if we generate one)
- [ ] Terms & Conditions (for online stores)

---

## Form Schema Mapping (for `onboarding_templates.schema_json`)

```json
{
  "version": 1,
  "service": "website-creation",
  "sections": [
    {
      "key": "business_info",
      "title": "Business Information",
      "fields": [
        { "key": "business_name", "label": "Business name", "type": "text", "required": true },
        { "key": "tagline", "label": "Tagline", "type": "text" },
        { "key": "ssm", "label": "Business registration number (SSM)", "type": "text", "required": true },
        { "key": "address", "label": "Business address", "type": "textarea", "required": true },
        { "key": "phone", "label": "Phone number", "type": "tel", "required": true },
        { "key": "email", "label": "Email address", "type": "email", "required": true },
        { "key": "operating_hours", "label": "Operating hours", "type": "textarea" }
      ]
    },
    {
      "key": "brand_assets",
      "title": "Brand Assets",
      "fields": [
        { "key": "logo", "label": "Logo (PNG/SVG, transparent)", "type": "file", "accept": ".png,.svg", "required": true },
        { "key": "brand_colors", "label": "Brand colours (hex)", "type": "color_list" },
        { "key": "fonts", "label": "Preferred fonts / brand guide", "type": "file_or_text" }
      ]
    },
    {
      "key": "content",
      "title": "Content",
      "fields": [
        { "key": "about_us", "label": "About Us / company story", "type": "textarea", "required": true },
        { "key": "services", "label": "Services / products (name + description)", "type": "repeater", "fields": [
          { "key": "name", "type": "text" }, { "key": "description", "type": "textarea" }
        ]},
        { "key": "pricing", "label": "Pricing (if displayed)", "type": "textarea" },
        { "key": "team", "label": "Team members", "type": "repeater", "fields": [
          { "key": "name", "type": "text" }, { "key": "title", "type": "text" }, { "key": "bio", "type": "textarea" }, { "key": "photo", "type": "file" }
        ]},
        { "key": "testimonials", "label": "Customer testimonials", "type": "repeater", "fields": [
          { "key": "text", "type": "textarea" }, { "key": "reviewer", "type": "text" }
        ]},
        { "key": "faq", "label": "FAQ", "type": "repeater", "fields": [
          { "key": "question", "type": "text" }, { "key": "answer", "type": "textarea" }
        ]}
      ]
    },
    {
      "key": "media",
      "title": "Media",
      "fields": [
        { "key": "photos", "label": "Professional photos", "type": "file_multi", "accept": "image/*" },
        { "key": "videos", "label": "Videos", "type": "file_multi", "accept": "video/*" }
      ]
    },
    {
      "key": "design",
      "title": "Design Preferences",
      "fields": [
        { "key": "references", "label": "Reference websites (1–3)", "type": "url_list", "max": 3 },
        { "key": "style", "label": "Preferred style", "type": "multi_select", "options": ["Modern", "Bold", "Minimal", "Warm", "Luxury", "Playful", "Corporate"] },
        { "key": "goal", "label": "Main goal", "type": "select", "options": ["Sell", "Generate leads", "Portfolio", "Info"], "required": true }
      ]
    },
    {
      "key": "technical",
      "title": "Technical",
      "fields": [
        { "key": "domain", "label": "Domain name (and login if transferring)", "type": "textarea" },
        { "key": "hosting", "label": "Existing hosting provider", "type": "text" },
        { "key": "facebook_url", "label": "Facebook page URL", "type": "url" },
        { "key": "instagram_url", "label": "Instagram URL", "type": "url" },
        { "key": "tiktok_url", "label": "TikTok URL", "type": "url" },
        { "key": "other_socials", "label": "Other social media links", "type": "url_list" },
        { "key": "google_business", "label": "Google Business Profile link", "type": "url" },
        { "key": "third_party_tools", "label": "Third-party tools needed (booking, chat, etc.)", "type": "textarea" }
      ]
    },
    {
      "key": "legal",
      "title": "Legal",
      "fields": [
        { "key": "privacy_policy", "label": "Privacy Policy (upload or we generate)", "type": "file_or_choice", "choices": ["I have one", "Please generate"] },
        { "key": "terms", "label": "Terms & Conditions (online stores)", "type": "file_or_choice", "choices": ["I have one", "Please generate", "Not applicable"] }
      ]
    }
  ],
  "submit_rule": "Build only begins upon full submission."
}
```
