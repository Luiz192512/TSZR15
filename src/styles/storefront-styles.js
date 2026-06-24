import accountStyles from "@/src/components/account/storefront-account.module.css";
import catalogStyles from "@/src/components/catalog/storefront-catalog.module.css";
import colorStyles from "@/src/components/storefront/storefront-colors.module.css";
import headerStyles from "@/src/components/site-header.module.css";
import shellStyles from "@/src/components/storefront/storefront-shell.module.css";
import foundationStyles from "@/src/styles/storefront-foundation.module.css";

function mergeStyleMaps(...styleMaps) {
  return styleMaps.reduce((merged, styleMap) => {
    for (const [className, scopedClassName] of Object.entries(styleMap)) {
      merged[className] = merged[className]
        ? `${merged[className]} ${scopedClassName}`
        : scopedClassName;
    }

    return merged;
  }, {});
}

// Preserve the previous cascade while each stylesheet now belongs to a feature area.
export default mergeStyleMaps(
  foundationStyles,
  catalogStyles,
  headerStyles,
  accountStyles,
  shellStyles,
  colorStyles
);
