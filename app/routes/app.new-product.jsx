import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useRouteError, useFetcher, useNavigation, useSearchParams } from "react-router";
import { buildAppUrl, navigateEmbedded, currentEmbeddedAction } from "../utils/embedded-navigation";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import styles from "../components/app.new-product.module.css";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const title = formData.get("title");
  const description = formData.get("description");
  const price = formData.get("price") || "0.00";
  const compareAtPrice = formData.get("compareAtPrice") || null;
  const groupId = parseInt(formData.get("groupId"));
  const imageFiles = formData.getAll("images");

  if (!groupId || isNaN(groupId)) {
    return { success: false, error: "Invalid asset group" };
  }

  try {
    const createResponse = await admin.graphql(
      `#graphql
      mutation CreateDigitalProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            variants(first: 1) {
              edges {
                node {
                  id
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          product: {
            title,
            descriptionHtml: description,
            status: "ACTIVE",
            tags: ["digital", "course", "download"],
          },
        },
      },
    );

    const createData = await createResponse.json();

    if (createData?.errors?.length) {
      console.error("productCreate GraphQL errors:", createData.errors);
      return { success: false, error: createData.errors[0]?.message || "Failed to create product" };
    }

    if (createData?.data?.productCreate?.userErrors?.length > 0) {
      console.error("productCreate userErrors:", createData.data.productCreate.userErrors);
      return { success: false, error: createData.data.productCreate.userErrors[0]?.message };
    }

    const productId = createData.data.productCreate.product.id;
    const defaultVariantId =
      createData.data.productCreate.product.variants.edges[0]?.node.id;

    if (defaultVariantId) {
      const variantInput = {
        id: defaultVariantId,
        price,
      };

      if (compareAtPrice) {
        variantInput.compareAtPrice = compareAtPrice;
      }

      const variantResponse = await admin.graphql(
        `#graphql
        mutation UpdateDigitalProductVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants {
              id
              price
            }
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            productId,
            variants: [variantInput],
          },
        },
      );

      const variantData = await variantResponse.json();

      if (variantData?.errors?.length) {
        console.error("productVariantsBulkUpdate GraphQL errors:", variantData.errors);
        return {
          success: false,
          error: variantData.errors[0]?.message || "Failed to update product price",
        };
      }

      if (variantData?.data?.productVariantsBulkUpdate?.userErrors?.length > 0) {
        console.error(
          "productVariantsBulkUpdate userErrors:",
          variantData.data.productVariantsBulkUpdate.userErrors,
        );
        return {
          success: false,
          error: variantData.data.productVariantsBulkUpdate.userErrors[0]?.message,
        };
      }

      const variantIdNumeric = defaultVariantId.split("/").pop();
      try {
        const restResponse = await admin.rest.put({
          path: `variants/${variantIdNumeric}.json`,
          data: {
            variant: {
              id: parseInt(variantIdNumeric),
              requires_shipping: false,
            },
          },
        });
        if (!restResponse.ok) {
          const errorText = await restResponse.text();
          console.error("Failed to update variant shipping via REST:", restResponse.status, errorText);
        } else {
          console.log("Successfully updated variant requires_shipping to false via REST");
        }
      } catch (err) {
        console.error("Error during REST variant shipping update:", err);
      }
    }

    const validImageFiles = imageFiles.filter(
      (f) => f && typeof f === "object" && f.size > 0,
    );

    if (validImageFiles.length > 0) {
      try {
        const stagedTargetsResponse = await admin.graphql(
          `#graphql
          mutation StageProductImages($input: [StagedUploadInput!]!) {
            stagedUploadsCreate(input: $input) {
              stagedTargets {
                url
                resourceUrl
                parameters {
                  name
                  value
                }
              }
              userErrors {
                field
                message
              }
            }
          }`,
          {
            variables: {
              input: validImageFiles.map((file) => ({
                filename: file.name,
                mimeType: file.type || "image/jpeg",
                resource: "PRODUCT_IMAGE",
                fileSize: String(file.size),
                httpMethod: "POST",
              })),
            },
          },
        );

        const stagedData = await stagedTargetsResponse.json();

        if (
          stagedData?.errors?.length ||
          stagedData?.data?.stagedUploadsCreate?.userErrors?.length > 0
        ) {
          console.error(
            "stagedUploadsCreate errors:",
            stagedData?.errors || stagedData?.data?.stagedUploadsCreate?.userErrors,
          );
        } else {
          const stagedTargets = stagedData.data.stagedUploadsCreate.stagedTargets;

          const resourceUrls = await Promise.all(
            stagedTargets.map(async (target, index) => {
              const file = validImageFiles[index];
              const uploadForm = new FormData();

              for (const param of target.parameters) {
                uploadForm.append(param.name, param.value);
              }
              uploadForm.append("file", file);

              const uploadResponse = await fetch(target.url, {
                method: "POST",
                body: uploadForm,
              });

              if (!uploadResponse.ok) {
                console.error(
                  `Failed to upload image ${file.name}:`,
                  uploadResponse.statusText,
                );
                return null;
              }

              return target.resourceUrl;
            }),
          );

          const validResourceUrls = resourceUrls.filter(Boolean);

          if (validResourceUrls.length > 0) {
            const mediaResponse = await admin.graphql(
              `#graphql
              mutation AttachProductImages($productId: ID!, $media: [CreateMediaInput!]!) {
                productCreateMedia(productId: $productId, media: $media) {
                  media {
                    ... on MediaImage {
                      id
                    }
                  }
                  mediaUserErrors {
                    field
                    message
                  }
                }
              }`,
              {
                variables: {
                  productId,
                  media: validResourceUrls.map((resourceUrl) => ({
                    originalSource: resourceUrl,
                    mediaContentType: "IMAGE",
                  })),
                },
              },
            );

            const mediaData = await mediaResponse.json();
            if (mediaData?.data?.productCreateMedia?.mediaUserErrors?.length > 0) {
              console.error(
                "productCreateMedia errors:",
                mediaData.data.productCreateMedia.mediaUserErrors,
              );
            }
          }
        }
      } catch (err) {
        console.error("Image upload failed:", err);
      }
    }

    const result = await prisma.assetGroup.updateMany({
      where: { id: groupId, shop },
      data: { productId },
    });

    if (result.count === 0) {
      return { success: false, error: "Asset group not found or access denied" };
    }

    return { success: true };
  } catch (err) {
    if (err instanceof Response) {
      const body = await err.text().catch(() => "");
      console.error("NEW PRODUCT ACTION ERROR:", err.status, body);
      return {
        success: false,
        error:
          err.status === 403
            ? "Missing Shopify permissions. Reinstall the app to grant product/file write scopes."
            : `Failed to create product (${err.status})`,
      };
    }

    console.error("NEW PRODUCT ACTION ERROR:", err);
    return { success: false, error: "Unexpected error while creating product" };
  }
};

const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={styles.backIcon}>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const SaveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);

const CloudUploadIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const PackageIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
    <polygon points="12 22.08 12 12 3 6.92 3 17.08 12 22.08" />
    <polygon points="12 22.08 21 17.08 21 6.92 12 12 12 22.08" />
    <polygon points="12 12 3 6.92 12 1.84 21 6.92 12 12" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const XIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function NewProduct() {
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const location = useLocation();
  const navigation = useNavigation();
  const fetcher = useFetcher();

  const fileInputRef = useRef(null);
  const editorRef = useRef(null);

  //const groupId = location.state?.groupId || "";
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get("groupId") || "";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Choose a Category");
  const [images, setImages] = useState([]);
  const [price, setPrice] = useState("0.00");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [chargeTax, setChargeTax] = useState(true);
  const [requiresShipping, setRequiresShipping] = useState(false);
  const [status, setStatus] = useState("ACTIVE");
  const [productType, setProductType] = useState("None");
  const [collections, setCollections] = useState(["Home page"]);
  const [collectionsQuery, setCollectionsQuery] = useState("");
  const [tags, setTags] = useState(["course", "digital", "download"]);
  const [newTag, setNewTag] = useState("");

  const handleEditorCommand = (command, value = null) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      setDescription(editorRef.current.innerHTML);
    }
  };

  const handleLinkCommand = () => {
    const url = prompt("Enter the URL:");
    if (url) handleEditorCommand("createLink", url);
  };

  const handleImageCommand = () => {
    const url = prompt("Enter the image URL:");
    if (url) handleEditorCommand("insertImage", url);
  };

  // Store both blob preview URL and the raw File object
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files || []);
    const newEntries = files.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      url: URL.createObjectURL(file),
      name: file.name,
      file,
    }));
    setImages((prev) => [...prev, ...newEntries]);
  };

  const triggerUploadClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleRemoveImage = (id) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleAddTag = (e) => {
    if ((e.key === "Enter" || e.key === ",") && newTag.trim()) {
      e.preventDefault();
      const tag = newTag.trim().toLowerCase().replace(/,/g, "");
      if (tag && !tags.includes(tag)) setTags((prev) => [...prev, tag]);
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags((prev) => prev.filter((tag) => tag !== tagToRemove));
  };

  const handleAddCollection = (e) => {
    if (e.key === "Enter" && collectionsQuery.trim()) {
      e.preventDefault();
      const col = collectionsQuery.trim();
      if (!collections.includes(col)) setCollections((prev) => [...prev, col]);
      setCollectionsQuery("");
    }
  };

  const handleRemoveCollection = (colToRemove) => {
    setCollections((prev) => prev.filter((col) => col !== colToRemove));
  };

  const handleDiscard = () => {
    navigateEmbedded("/app/asset-saved", searchParams, { groupId });
  };

  const handleSaveSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) {
      try {
        shopify.toast.show("Title is required");
      } catch (err) {
        alert("Title is required");
      }
      return;
    }

    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    formData.append("price", price);
    formData.append("compareAtPrice", compareAtPrice);
    formData.append("groupId", groupId);
    formData.append("status", status);
    formData.append("productType", productType);
    formData.append("requiresShipping", String(requiresShipping));

    // Append raw File objects for server-side upload to Shopify
    images.forEach((img) => {
      formData.append("images", img.file);
    });

    fetcher.submit(formData, {
      method: "POST",
      encType: "multipart/form-data",
      action: currentEmbeddedAction("/app/new-product", searchParams),
    });
  };

  useEffect(() => {
    if (fetcher.data?.success) {
      try {
        shopify.toast.show("Product created successfully!");
      } catch (err) {
        console.log("App Bridge Toast failed, continuing navigation.");
      }
      navigateEmbedded("/app/dashboard", searchParams);
    } else if (fetcher.data && !fetcher.data.success) {
      try {
        shopify.toast.show(
          fetcher.data.error || "Error saving product. Please check console.",
        );
      } catch (err) {
        console.log("App Bridge Toast failed.");
      }
    }
  }, [fetcher.data, searchParams, shopify]);

  const isLoading = navigation.state === "loading" || fetcher.state === "submitting";

  return (
    <div className={styles.pageContainer}>
      <main className={styles.mainContent}>
        <div className={styles.pageHeader}>
          <div className={styles.headerLeft}>
            <button type="button" className={styles.backButton} onClick={handleDiscard} aria-label="Back">
              <BackIcon />
            </button>
            <h2 className={styles.pageTitle}>Digital product</h2>
          </div>
          <div className={styles.headerRight}>
            <button type="button" className={styles.discardButton} onClick={handleDiscard} disabled={isLoading}>
              Discard
            </button>
            <button
              type="button"
              className={`${styles.saveButton} ${!title.trim() ? styles.saveButtonDisabled : ""}`}
              onClick={handleSaveSubmit}
              disabled={isLoading}
            >
              <SaveIcon />
              Save
            </button>
          </div>
        </div>

        <form onSubmit={handleSaveSubmit}>
          <div className={styles.gridContainer}>
            <div className={styles.leftColumn}>
              {/* Basic details */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Basic details</h3>
                  <p className={styles.cardSubtitle}>Give your product a name and describe what customers will receive.</p>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.formRow}>
                    <label htmlFor="product-title" className={styles.fieldLabel}>Title</label>
                    <input
                      id="product-title"
                      type="text"
                      className={styles.textInput}
                      placeholder="e.g. Mastery Course Bundle"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className={styles.formRow}>
                    <label className={styles.fieldLabel}>Description</label>
                    <div className={styles.editorContainer}>
                      <div className={styles.editorToolbar}>
                        <button type="button" className={styles.toolbarButton} onClick={() => handleEditorCommand("bold")} title="Bold">B</button>
                        <button type="button" className={styles.toolbarButton} onClick={() => handleEditorCommand("italic")} title="Italic">I</button>
                        <button type="button" className={styles.toolbarButton} onClick={() => handleEditorCommand("underline")} title="Underline">U</button>
                        <button type="button" className={styles.toolbarButton} onClick={() => handleEditorCommand("strikeThrough")} title="Strikethrough">S</button>
                        <button type="button" className={styles.toolbarButton} onClick={handleLinkCommand} title="Insert Link">🔗</button>
                        <button type="button" className={styles.toolbarButton} onClick={handleImageCommand} title="Insert Image">🖼️</button>
                      </div>
                      <div
                        ref={editorRef}
                        className={styles.editorBody}
                        contentEditable
                        onInput={(e) => setDescription(e.currentTarget.innerHTML)}
                        placeholder="Add a description of your product, key benefits, and what's included after purchase..."
                      />
                    </div>
                  </div>

                  <div className={styles.formRow}>
                    <label htmlFor="product-category" className={styles.fieldLabel}>Category</label>
                    <select id="product-category" className={styles.selectInput} value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option disabled>Choose a Category</option>
                      <option value="Digital Goods">Digital Goods</option>
                      <option value="Online Courses">Online Courses</option>
                      <option value="Ebooks">Ebooks</option>
                      <option value="Software">Software</option>
                      <option value="Music & Audio">Music & Audio</option>
                      <option value="Video & Templates">Video & Templates</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Media */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Media</h3>
                  <p className={styles.cardSubtitle}>Add images, videos, or 3D models to showcase your product.</p>
                </div>
                <div className={styles.cardBody}>
                  <div
                    className={styles.mediaDropzone}
                    onClick={triggerUploadClick}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const files = Array.from(e.dataTransfer.files || []);
                      const newEntries = files.map((file) => ({
                        id: Math.random().toString(36).substr(2, 9),
                        url: URL.createObjectURL(file),
                        name: file.name,
                        file,
                      }));
                      setImages((prev) => [...prev, ...newEntries]);
                    }}
                  >
                    <div className={styles.mediaIconWrapper}><CloudUploadIcon /></div>
                    <h4 className={styles.mediaTitle}>Drag and drop your media here</h4>
                    <p className={styles.mediaSubtext}>Accepts images, videos, or 3D models</p>
                    <div className={styles.mediaDividerRow}>
                      <div className={styles.mediaDividerLine} />
                      <span className={styles.mediaDividerText}>or</span>
                      <div className={styles.mediaDividerLine} />
                    </div>
                    <button type="button" className={styles.uploadButton} onClick={(e) => { e.stopPropagation(); triggerUploadClick(); }}>
                      <span className={styles.uploadIcon}><PlusIcon /></span>
                      Upload new
                    </button>
                  </div>

                  {images.length > 0 && (
                    <div className={styles.imagePreviews}>
                      {images.map((img) => (
                        <div key={img.id} className={styles.imagePreviewCard}>
                          <img src={img.url} alt={img.name} className={styles.imagePreviewImg} />
                          <button type="button" className={styles.removeImageButton} onClick={() => handleRemoveImage(img.id)} aria-label="Remove image">
                            <XIcon />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <input
                    type="file"
                    ref={fileInputRef}
                    multiple
                    accept="image/*,video/*"
                    onChange={handleImageUpload}
                    style={{ display: "none" }}
                  />
                </div>
              </div>

              {/* Pricing */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Pricing</h3>
                  <p className={styles.cardSubtitle}>Set the price customers pay to access this digital product.</p>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.pricingRow}>
                    <div className={styles.formRow}>
                      <label htmlFor="product-price" className={styles.fieldLabel}>Price</label>
                      <div className={styles.prefixInputWrapper}>
                        <span className={styles.prefixSpan}>$</span>
                        <input id="product-price" type="text" className={styles.prefixedInput} placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} />
                      </div>
                    </div>
                    <div className={styles.formRow}>
                      <label htmlFor="product-compare-price" className={styles.fieldLabel}>
                        Compare-at price
                        <span className={styles.infoIconWrapper} title="Show a slashed original price next to the active price."><InfoIcon /></span>
                      </label>
                      <div className={styles.prefixInputWrapper}>
                        <span className={styles.prefixSpan}>$</span>
                        <input id="product-compare-price" type="text" className={`${styles.prefixedInput} ${styles.compareAtPriceWrapper}`} placeholder="—" value={compareAtPrice} onChange={(e) => setCompareAtPrice(e.target.value)} />
                      </div>
                    </div>
                  </div>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" className={styles.checkboxInput} checked={chargeTax} onChange={(e) => setChargeTax(e.target.checked)} />
                    <span>Charge tax on this product</span>
                  </label>
                </div>
              </div>

              {/* Shipping */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Shipping</h3>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.toggleRow}>
                    <div className={styles.toggleLeft}>
                      <div className={styles.toggleIcon}><PackageIcon /></div>
                      <div className={styles.toggleText}>
                        <span className={styles.toggleTitle}>Shipping</span>
                        <span className={styles.toggleSubtitle}>Not a physical product</span>
                      </div>
                    </div>
                    <label className={styles.switch}>
                      <input type="checkbox" checked={false} disabled />
                      <span className={styles.slider}></span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Variant */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Variant</h3>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.variantRow} onClick={() => { try { shopify.toast.show("Variant options setup coming soon!"); } catch (err) { alert("Variant setup clicked"); } }}>
                    <span className={styles.variantPlusIcon}><PlusIcon /></span>
                    Add color size etc.
                  </div>
                </div>
              </div>
            </div>

            {/* Right sidebar */}
            <div className={styles.rightColumn}>
              {/* Status */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Status</h3>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.formRow}>
                    <label htmlFor="product-status" className={styles.fieldLabel}>Product status</label>
                    <div className={styles.statusDropdownWrapper}>
                      <span className={`${styles.statusIndicatorDot} ${status === "ACTIVE" ? styles.statusActiveDot : status === "DRAFT" ? styles.statusDraftDot : styles.statusArchivedDot}`} />
                      <select id="product-status" className={`${styles.selectInput} ${styles.statusSelect}`} value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="ACTIVE">Active</option>
                        <option value="DRAFT">Draft</option>
                        <option value="ARCHIVED">Archived</option>
                      </select>
                    </div>
                  </div>
                  {status === "ACTIVE" && (
                    <div className={styles.visibilityBanner}>
                      <span className={styles.visibilityIcon}><CheckCircleIcon /></span>
                      go to products page to make the product visible in store
                    </div>
                  )}
                </div>
              </div>

              {/* Product organization */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Product organization</h3>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.formRow}>
                    <label htmlFor="product-type" className={styles.fieldLabel}>Type</label>
                    <select id="product-type" className={styles.selectInput} value={productType} onChange={(e) => setProductType(e.target.value)}>
                      <option value="None">None</option>
                      <option value="Course">Course</option>
                      <option value="Ebook">Ebook</option>
                      <option value="Downloadable">Downloadable</option>
                    </select>
                  </div>

                  <div className={styles.formRow}>
                    <label htmlFor="product-collections" className={styles.fieldLabel}>Collections</label>
                    <div className={styles.collectionSearchWrapper}>
                      <span className={styles.collectionSearchIcon}><SearchIcon /></span>
                      <input
                        id="product-collections"
                        type="text"
                        className={styles.collectionSearchInput}
                        placeholder="Search collections..."
                        value={collectionsQuery}
                        onChange={(e) => setCollectionsQuery(e.target.value)}
                        onKeyDown={handleAddCollection}
                      />
                    </div>
                    {collections.length > 0 && (
                      <div className={styles.collectionBadgeRow}>
                        {collections.map((col) => (
                          <span key={col} className={styles.collectionBadge}>
                            {col}
                            <button type="button" className={styles.collectionRemoveBtn} onClick={() => handleRemoveCollection(col)} aria-label={`Remove ${col} collection`}>
                              <XIcon />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={styles.formRow}>
                    <label className={styles.fieldLabel}>Tags</label>
                    <div className={styles.tagsContainer}>
                      {tags.map((tag) => (
                        <span key={tag} className={styles.tagChip}>
                          {tag}
                          <button type="button" className={styles.tagRemoveBtn} onClick={() => handleRemoveTag(tag)} aria-label={`Remove tag ${tag}`}>
                            <XIcon />
                          </button>
                        </span>
                      ))}
                      <input
                        type="text"
                        placeholder="Add a tag..."
                        className={styles.tagInput}
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={handleAddTag}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};