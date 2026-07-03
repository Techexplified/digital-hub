import React, { useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router";
import { buildAppUrl } from "../utils/embedded-navigation";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import AppHeader from "../components/AppHeader/AppHeader";
import styles from "../components/app.add-link.module.css";

// 1. Authentication Loader (Embedded Shopify Admin Route)
export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

// 2. SVG Icon Components
const BackIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={styles.backIcon}
  >
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const LinkIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 13a5 5 0 0 0 7.54.54l-3 3a5 5 0 0 0-7.07-7.07l1.71-1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l3-3a5 5 0 0 0 7.07 7.07l-1.71 1.71" />
    <line x1="8" y1="16" x2="16" y2="8" />
  </svg>
);

const TagIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" strokeWidth="2.5" />
  </svg>
);

const PlusIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={styles.addAssetIcon}
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

// Brand Badge Icon Components
const NotionIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const CalendlyIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const GoogleDriveIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19L17 5H7L2 19H22Z" />
  </svg>
);

const DropboxIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
  </svg>
);

const YouTubeIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="18" rx="4" ry="4" />
    <polygon points="10 8 16 12 10 16 10 8" />
  </svg>
);

const CanvaIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

// 3. Page Component
export default function AddLink() {
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const existingAssets = location.state?.assets || [];

  // State values for form inputs
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");

  const handleAvatarClick = () => {
    try {
      shopify.toast.show("User avatar profile clicked!");
    } catch (e) {
      console.log("Avatar profile clicked (App Bridge not initialized outside admin frame)");
    }
  };

  const handleCancel = () => {
    navigate(buildAppUrl("/app/add-assets", searchParams), {
      state: {
        assets: existingAssets,
      },
    });
  };

  const handleAddAssetSubmit = (e) => {
    e.preventDefault();
    try {
      shopify.toast.show("Link asset added successfully!");
    } catch (err) {
      console.log("Toast failed - Action processed:", { url, name, instructions });
    }
    // Navigate back to add-assets route passing existing assets + new link
    navigate(buildAppUrl("/app/add-assets", searchParams), {
      state: {
        assets: existingAssets,
        asset: { type: "link", url, link_name: name, instructions },
      },
    });
  };

  return (
    <div className={styles.pageContainer}>
      {/* <AppHeader onAvatarClick={handleAvatarClick} /> */}

      <main className={styles.mainContent}>
        {/* Page title and navigation header */}
        <div className={styles.pageHeader}>
          <button
            type="button"
            className={styles.backButton}
            onClick={handleCancel}
            aria-label="Back to dashboard"
          >
            <BackIcon />
          </button>
          <h2 className={styles.pageTitle}>Add assets</h2>
        </div>

        {/* Content Card containing the form */}
        <div className={styles.card}>
          <form onSubmit={handleAddAssetSubmit}>
            <div className={styles.cardBody}>
              {/* URL Field */}
              <div className={styles.formRow}>
                <div className={styles.labelRow}>
                  <label htmlFor="url-input" className={styles.fieldLabel}>
                    URL
                  </label>
                  <span className={styles.labelHelper}>
                    Paste any supported link
                  </span>
                </div>
                <div className={styles.inputWrapper}>
                  <span className={styles.inputIcon}>
                    <LinkIcon />
                  </span>
                  <input
                    id="url-input"
                    type="url"
                    required
                    className={`${styles.textInput} ${styles.urlInput}`}
                    placeholder="e.g. https://notion.so/your-page"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>

                {/* Predefined brand badges */}
                <div className={styles.badgesContainer}>
                  <span className={`${styles.badge} ${styles.badgeNotion}`}>
                    <span className={styles.badgeIcon}><NotionIcon /></span>
                    Notion
                  </span>
                  <span className={`${styles.badge} ${styles.badgeCalendly}`}>
                    <span className={styles.badgeIcon}><CalendlyIcon /></span>
                    Calendly
                  </span>
                  <span className={`${styles.badge} ${styles.badgeGoogleDrive}`}>
                    <span className={styles.badgeIcon}><GoogleDriveIcon /></span>
                    Google Drive
                  </span>
                  <span className={`${styles.badge} ${styles.badgeDropbox}`}>
                    <span className={styles.badgeIcon}><DropboxIcon /></span>
                    Dropbox
                  </span>
                  <span className={`${styles.badge} ${styles.badgeYouTube}`}>
                    <span className={styles.badgeIcon}><YouTubeIcon /></span>
                    YouTube
                  </span>
                  <span className={`${styles.badge} ${styles.badgeCanva}`}>
                    <span className={styles.badgeIcon}><CanvaIcon /></span>
                    Canva
                  </span>
                  <span className={`${styles.badge} ${styles.badgeMore}`}>
                    + 6 more
                  </span>
                </div>
              </div>

              {/* Link Name Field */}
              <div className={styles.formRow}>
                <div className={styles.labelRow}>
                  <label htmlFor="name-input" className={styles.fieldLabel}>
                    Link name
                  </label>
                </div>
                <div className={styles.inputWrapper}>
                  <span className={styles.inputIcon}>
                    <TagIcon />
                  </span>
                  <input
                    id="name-input"
                    type="text"
                    required
                    className={`${styles.textInput} ${styles.normalInput}`}
                    placeholder="e.g. Course portal"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <span className={styles.fieldCaption}>
                  This is how the link appears to the customer.
                </span>
              </div>

              {/* Instructions Field */}
              <div className={styles.formRow}>
                <div className={styles.labelRow}>
                  <label htmlFor="instructions-input" className={styles.fieldLabel}>
                    Instructions{" "}
                    <span className={styles.optionalBadge}>Optional</span>
                  </label>
                  <span className={styles.labelHelper}>
                    Shown below the link on the page
                  </span>
                </div>
                <textarea
                  id="instructions-input"
                  className={styles.textareaInput}
                  placeholder="e.g. Log in with the email address used at checkout to get started."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </div>
            </div>

            {/* Bottom Actions Row */}
            <div className={styles.cardFooter}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.addAssetButton}
              >
                <PlusIcon />
                Add asset
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
