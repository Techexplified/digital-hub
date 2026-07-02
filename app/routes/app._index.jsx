import React from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import AppHeader from "../components/AppHeader/AppHeader";
import EmptyAssetCard from "../components/EmptyAssetCard/EmptyAssetCard";
import styles from "../components/app._index.module.css";

export const loader = async ({ request }) => {
  const { session, redirect } = await authenticate.admin(request);

  const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shopRecord || !shopRecord.onboardingCompleted) {
    throw redirect("/app/onboarding");
  }

  return null;
};

/*export const action = async ({ request }) => {
  // Preserve architecture: boilerplate Shopify mutation action
  const { admin } = await authenticate.admin(request);
  const color = ["Red", "Orange", "Yellow", "Green"][
    Math.floor(Math.random() * 4)
  ];
  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
          }
        }
      }`,
    {
      variables: {
        product: {
          title: `${color} Snowboard`,
        },
      },
    },
  );
  const responseJson = await response.json();
  return {
    product: responseJson.data.productCreate.product,
  };
};*/

export default function Index() {
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const fileInputRef = React.useRef(null);

  const handleAddFile = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (event) => {
    const files = event.target.files;
  if (files && files.length > 0) {
    navigate("/app/add-assets", {
      state: {
        asset: {
          type: "file",
          name: files[0].name,
          size: files[0].size,
          fileObject: files[0]
        }
      }
    });
  }
  };

  const handleAddLink = () => {
    navigate("/app/add-link");
  };

  const handleAvatarClick = () => {
    try {
      shopify.toast.show("User avatar profile clicked!");
    } catch (e) {
      console.log("Avatar profile clicked (App Bridge not initialized outside admin frame)");
    }
  };

  return (
    <div className={styles.pageContainer}>
      {/* <AppHeader onAvatarClick={handleAvatarClick} /> */}
      <main className={styles.mainContent}>
        <EmptyAssetCard onAddFile={handleAddFile} onAddLink={handleAddLink} />
      </main>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: "none" }}
        accept=".pdf,.zip,.epub"
      />
    </div>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
