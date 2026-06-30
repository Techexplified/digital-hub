// import {
//   reactExtension,
//   useApi,
//   View,
//   BlockStack,
//   InlineStack,
//   Badge,
//   Heading,
//   Text,
//   Button,
//   Icon,
// } from "@shopify/ui-extensions-react/checkout";
// import { useState, useEffect } from "react";

// // Use the correct export pattern with reactExtension
// export default reactExtension("purchase.thank-you.block.render", () => <Extension />);

// function Extension() {
//   const api = useApi();

//   // Get settings reactively
//   const [settings, setSettings] = useState(api.settings.current);
//   useEffect(() => {
//     return api.settings.subscribe((newSettings) => {
//       setSettings(newSettings);
//     });
//   }, [api.settings]);

//   // Get buyerIdentity customer reactively
//   const [customer, setCustomer] = useState(api.buyerIdentity.customer?.current);
//   useEffect(() => {
//     return api.buyerIdentity.customer?.subscribe((newCustomer) => {
//       setCustomer(newCustomer);
//     });
//   }, [api.buyerIdentity.customer]);

//   const vaultUrl = settings?.vault_page_url || "/account";
//   const firstName = customer?.firstName || "";

//   return (
//     <View
//       padding="base"
//       border="base"
//       cornerRadius="large"
//       background="subdued"
//     >
//       <BlockStack spacing="base" inlineAlignment="center">
//         {/* Available Now Badge */}
//         <Badge tone="success">Available Now</Badge>

//         {/* Content Row: Icon & Text */}
//         <InlineStack spacing="base" blockAlignment="center">
//           {/* File/Order Icon Box */}
//           <View
//             padding="tight"
//             cornerRadius="base"
//             background="base"
//           >
//             <Icon source="order" size="large" />
//           </View>

//           {/* Heading & Descriptions */}
//           <BlockStack spacing="extraTight">
//             <Heading>Your files are ready!</Heading>
//             <Text color="subdued" type="small">
//               Your digital products have been securely added to your store account. You can access and download them instantly from your personal vault.
//             </Text>
//           </BlockStack>
//         </InlineStack>

//         {/* Action Button */}
//         <Button
//           href={vaultUrl}
//           inlineSize="fill"
//           variant="primary"
//         >
//           <InlineStack spacing="tight" blockAlignment="center" inlineAlignment="center">
//             <Icon source="order" />
//             <Text>Go to My Digital Vault</Text>
//             <Icon source="arrow-right" />
//           </InlineStack>
//         </Button>
//       </BlockStack>
//     </View>
//   );
// }

export default function Extension() {
  const api = shopify;
  const vaultUrl = api.extension?.settings?.vault_page_url?.value || "/pages/my-downloads";

  return (
    <s-box padding="base" border="base" border-radius="large" background="subdued">
      <s-stack direction="block" gap="base" align-items="center">
        <s-badge tone="success">Available Now</s-badge>
        <s-stack direction="inline" gap="base" align-items="center">
          <s-box padding="small" border-radius="base" background="base">
            <s-icon source="delivered" />
          </s-box>
          <s-stack direction="block" gap="small">
            <s-heading>Your files are ready!</s-heading>
            <s-text>
              Your digital products have been securely added to your store account. 
              You can access and download them instantly from your personal vault.
            </s-text>
          </s-stack>
        </s-stack>
        <s-button href={vaultUrl} variant="primary" width="fill">
          Go to My Digital Vault →
        </s-button>
      </s-stack>
    </s-box>
  );
}