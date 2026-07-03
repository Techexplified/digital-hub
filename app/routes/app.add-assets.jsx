import React, { useState, useEffect, useRef } from "react";
//import { useNavigate, useLocation, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import styles from "../components/app.add-assets.module.css";
import prisma from "../db.server";
import { useNavigate, useLocation, useRouteError, useFetcher, useSearchParams } from "react-router";



export const action = async ({ request }) => {
  try {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  console.log("formData entries:", Object.fromEntries(formData));

  // Extract the JSON metadata string and parse it
  const assetsJson = formData.get("assets");
  console.log("assetsJson:", assetsJson);
  const assets = JSON.parse(assetsJson); // array of asset metadata

  const accessLimitRaw = formData.get("accessLimit");
  const accessLimit = accessLimitRaw ? parseInt(accessLimitRaw) : null;

  // Create the group
  const assetGroup = await prisma.assetGroup.create({
    data: {
      shop,
      accessLimit,
    },
  });

  // Create each asset
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];

    if (asset.type === "file") {
      // Grab the actual file bytes from FormData using the index as key
      const file = formData.get(`file-${i}`);
      let fileData = null;
      if (file && typeof file.arrayBuffer === "function") {
        const arrayBuffer = await file.arrayBuffer();
        fileData = Buffer.from(arrayBuffer);
      }

      await prisma.asset.create({
        data: {
          groupId: assetGroup.id,
          type: "file",
          name: asset.name,
          size: asset.size,
          fileData,
        },
      });
    } else {
      // Link type
      await prisma.asset.create({
        data: {
          groupId: assetGroup.id,
          type: "link",
          url: asset.url,
          linkName: asset.link_name || asset.linkName,
          instructions: asset.instructions,
        },
      });
    }
  }

  return { success: true, groupId: assetGroup.id };
    } catch (err) {
    console.error("ACTION ERROR:", err);
    throw err;
  }
};




// 1. Authentication Loader (Embedded Shopify Admin Route)
export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
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
    className={styles.buttonIcon}
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const XIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const CheckIcon = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={styles.checkIcon}
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// 3. Helper Functions
const getExtension = (filename) => {
  if (!filename) return "";
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : "";
};

const getIconDetails = (asset) => {
  if (asset.type === "link") {
    return {
      className: styles.iconLink,
      text: "LINK",
    };
  }
  const ext = getExtension(asset.name);
  switch (ext) {
    case "PDF":
      return { className: styles.iconPDF, text: "PDF" };
    case "MP4":
      return { className: styles.iconMP4, text: "MP4" };
    case "ZIP":
      return { className: styles.iconZIP, text: "ZIP" };
    case "MP3":
      return { className: styles.iconMP3, text: "MP3" };
    case "EPUB":
      return { className: styles.iconEPUB, text: "EPUB" };
    default:
      return { className: styles.iconDefault, text: ext || "FILE" };
  }
};

const formatBytes = (bytes) => {
  if (bytes === 0 || !bytes) return "0 Bytes";
  if (typeof bytes === "string") return bytes;
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const isSameAsset = (a, b) => {
  if (!a || !b) return a === b;
  if (a.type !== b.type) return false;
  if (a.type === "file") {
    return a.name === b.name && a.size === b.size;
  } else {
    return a.url === b.url && a.link_name === b.link_name;
  }
};

// 4. Page Component
export default function AddAssets() {
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const location = useLocation();
  const fetcher = useFetcher();

  const fileInputRef = useRef(null);
  const processedKeyRef = useRef(null);

  // State management
  const [assets, setAssets] = useState([]);
  const [accessLimit, setAccessLimit] = useState("");

  // Sync state with location state safely
  useEffect(() => {
    // Avoid reprocessing the same location instance
    if (location.key === processedKeyRef.current) return;
    processedKeyRef.current = location.key;

    const stateAssets = location.state?.assets || [];
    const incomingAsset = location.state?.asset;

    setAssets((prev) => {
      let base = prev.length > 0 ? prev : stateAssets;

      if (incomingAsset) {
        const exists = base.some((a) => isSameAsset(a, incomingAsset));
        if (!exists) {
          return [...base, incomingAsset];
        }
      }
      return base;
    });
  }, [location]);

  const handleAvatarClick = () => {
    try {
      shopify.toast.show("User avatar profile clicked!");
    } catch (e) {
      console.log("Avatar profile clicked (App Bridge not initialized outside admin frame)");
    }
  };

  const handleCancel = () => {
    navigate("/app");
  };

  /*const handleSave = (e) => {
    e.preventDefault();
    console.log("Saving Assets & Access Limit:", {
      assets,
      accessLimit: accessLimit || "Unlimited",
    });
    try {
      shopify.toast.show("Assets details logged successfully!");
    } catch (err) {
      console.log("Toast failed - Data logged.");
    }
  };*/




  // const handleSave = async (e) => {
  // e.preventDefault();

  // const formData = new FormData();

  // // Append the assets metadata as JSON
  // const assetsMetadata = assets.map((asset, index) => {
  //   if (asset.type === "file") {
  //     return {
  //       type: asset.type,
  //       name: asset.name,
  //       size: asset.size,
  //     };
  //   } else {
  //     return {
  //       type: asset.type,
  //       url: asset.url,
  //       link_name: asset.link_name,
  //       instructions: asset.instructions,
  //     };
  //   }
  // });
  // formData.append("assets", JSON.stringify(assetsMetadata));

  // // Append the actual file blobs with keys matching the index
  // assets.forEach((asset, index) => {
  //   if (asset.type === "file" && asset.fileObject) {
  //     formData.append(`file-${index}`, asset.fileObject);
  //   }
  // });

  // // Append access limit
  // formData.append("accessLimit", accessLimit);

  // // Submit to the action (same route)
  // try {
  //   const response = await fetch("/app/add-assets", {
  //     method: "POST",
  //     body: formData,
  //   });

  //   if (response.ok) {
  //     const data = await response.json();
  //     shopify.toast.show("Assets saved successfully!");
  //     navigate("/app/asset-saved", { state: { groupId: data.groupId } });
  //   } else {
  //     shopify.toast.show("Failed to save assets. Please try again.");
  //   }
  // } catch (err) {
  //   console.error("Save failed:", err);
  //   shopify.toast.show("Something went wrong.");
  // }
//};





// Replace handleSave with this
const handleSave = async (e) => {
  e.preventDefault();

  const formData = new FormData();

  const assetsMetadata = assets.map((asset) => {
    if (asset.type === "file") {
      return { type: asset.type, name: asset.name, size: asset.size };
    } else {
      return { type: asset.type, url: asset.url, link_name: asset.link_name, instructions: asset.instructions };
    }
  });

  formData.append("assets", JSON.stringify(assetsMetadata));
  assets.forEach((asset, index) => {
    if (asset.type === "file" && asset.fileObject) {
      formData.append(`file-${index}`, asset.fileObject);
    }
  });
  formData.append("accessLimit", accessLimit);

  fetcher.submit(formData, { method: "POST", encType: "multipart/form-data" });
};

// Handle navigation after save
// useEffect(() => {
//   if (fetcher.data?.success) {
//     shopify.toast.show("Assets saved successfully!");
//     navigate("/app/asset-saved", { state: { groupId: fetcher.data.groupId } });
//   }
// }, [fetcher.data]);

// useEffect(() => {
//   if (fetcher.data?.success) {
//     shopify.toast.show("Assets saved successfully!");
//     navigate(`/app/asset-saved?groupId=${fetcher.data.groupId}`, {
//       state: { groupId: fetcher.data.groupId },
//     });
//   }
// }, [fetcher.data]);

  useEffect(() => {
  if (fetcher.data?.success) {
    shopify.toast.show("Assets saved successfully!");
    const query = searchParams.toString();
    const groupId = fetcher.data.groupId;
    navigate(query 
      ? `/app/asset-saved?groupId=${groupId}&${query}` 
      : `/app/asset-saved?groupId=${groupId}`
    );
  }
}, [fetcher.data, searchParams]);




  const handleRemoveAsset = (indexToRemove) => {
    setAssets((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleAddFileClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      navigate("/app/add-assets", {
        state: {
          assets: assets,
          asset: {
            type: "file",
            name: files[0].name,
            size: files[0].size,
            fileObject: files[0],
          },
        },
      });
    }
  };

  const handleAddLinkClick = () => {
    navigate("/app/add-link", {
      state: {
        assets: assets,
      },
    });
  };

  return (
    <div className={styles.pageContainer}>
      <main className={styles.mainContent}>
        {/* Page Title & Back Button */}
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

        {/* Content Card */}
        <div className={styles.card}>
          <form onSubmit={handleSave}>
            <div className={styles.cardBody}>
              {/* Assets Section */}
              <div>
                <h3 className={styles.assetListTitle}>Asset ({assets.length})</h3>
                <div className={styles.assetList}>
                  {assets.map((asset, index) => {
                    const details = getIconDetails(asset);
                    return (
                      <div key={index} className={styles.assetRow}>
                        {/* Type Badge */}
                        <div className={`${styles.assetIconContainer} ${details.className}`}>
                          {details.text}
                        </div>

                        {/* Name and Meta details */}
                        <div className={styles.assetInfo}>
                          <h4 className={styles.assetName}>
                            {asset.type === "file" ? asset.name : asset.link_name}
                          </h4>
                          <div className={styles.assetMeta}>
                            {asset.type === "file" ? (
                              <>
                                <span>{formatBytes(asset.size)}</span>
                                <span className={styles.uploadedBadge}>
                                  <CheckIcon /> Uploaded
                                </span>
                              </>
                            ) : (
                              <span>{asset.url}</span>
                            )}
                          </div>
                        </div>

                        {/* Remove Action Button */}
                        <button
                          type="button"
                          className={styles.removeButton}
                          onClick={() => handleRemoveAsset(index)}
                          aria-label={`Remove asset ${asset.type === "file" ? asset.name : asset.link_name}`}
                        >
                          <XIcon />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add buttons */}
              <div className={styles.actionsRow}>
                <button
                  type="button"
                  className={styles.outlinedButton}
                  onClick={handleAddFileClick}
                >
                  <PlusIcon /> Add File
                </button>
                <button
                  type="button"
                  className={styles.outlinedButton}
                  onClick={handleAddLinkClick}
                >
                  <PlusIcon /> Add Link
                </button>
              </div>

              {/* Access Limit Section */}
              <div className={styles.accessLimitSection}>
                <div className={styles.accessLimitHeader}>
                  <label htmlFor="access-limit" className={styles.accessLimitLabel}>
                    Access Limit
                  </label>
                  <span className={styles.accessLimitSubtitle}>
                    Set how many times user can download or access a asset
                  </span>
                </div>
                <input
                  id="access-limit"
                  type="text"
                  className={styles.accessLimitInput}
                  placeholder="Unlimited"
                  value={accessLimit}
                  onChange={(e) => setAccessLimit(e.target.value)}
                />
              </div>
            </div>

            {/* Footer Buttons */}
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
                className={styles.saveButton}
              >
                SAVE
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* Hidden File Input Explorer */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: "none" }}
        accept=".pdf,.mp4,.zip,.mp3,.epub"
      />
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
