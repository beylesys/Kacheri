import React from "react";

/** Lightweight loading spinner shown while a lazy-loaded drawer panel chunk is fetched. */
const PanelLoadingSpinner: React.FC = () => (
  <div className="panel-loading-spinner">
    <div className="panel-loading-spinner-circle" />
    <span className="panel-loading-spinner-text">Loading…</span>
  </div>
);

export default PanelLoadingSpinner;
