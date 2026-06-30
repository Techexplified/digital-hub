import React from "react";
import styles from "./FileTypeTags.module.css";

const DEFAULT_TAGS = ["PDF", "ZIP", "EPUB", "+ Links"];

/**
 * FileTypeTags component.
 * Displays a list of file extensions and link indicator tags.
 */
const FileTypeTags = ({ label = "Supported formats", tags = DEFAULT_TAGS }) => {
  return (
    <div className={styles.tagsContainer}>
      <span className={styles.label}>{label}</span>
      <div className={styles.list} role="list" aria-label="List of supported file formats">
        {tags.map((tag) => {
          // Special styling for "+ Links" or interactive/link tags if needed
          const isLinkTag = tag.toLowerCase().includes("link");
          const tagClass = `${styles.tag} ${isLinkTag ? styles.linkTag : ""}`;
          
          return (
            <span key={tag} className={tagClass} role="listitem">
              {tag}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default FileTypeTags;
