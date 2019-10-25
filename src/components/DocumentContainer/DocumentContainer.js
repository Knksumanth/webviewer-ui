import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

import core from 'core';
import { isIE } from 'helpers/device';
import { updateContainerWidth, getClassNameInIE, handleWindowResize } from 'helpers/documentContainerHelper';
import getNumberOfPagesToNavigate from 'helpers/getNumberOfPagesToNavigate';
import touchEventManager from 'helpers/TouchEventManager';
import getWebViewerConstructorOptions from 'helpers/getWebViewerConstructorOptions';
import { getMinZoomLevel, getMaxZoomLevel } from 'constants/zoomFactors';
import actions from 'actions';
import selectors from 'selectors';

import './DocumentContainer.scss';

class DocumentContainer extends React.PureComponent {
  static propTypes = {
    isLeftPanelOpen: PropTypes.bool,
    isRightPanelOpen: PropTypes.bool,
    isSearchOverlayOpen: PropTypes.bool,
    zoom: PropTypes.number.isRequired,
    currentPage: PropTypes.number,
    totalPages: PropTypes.number,
    isHeaderOpen: PropTypes.bool,
    dispatch: PropTypes.func.isRequired,
    openElement: PropTypes.func.isRequired,
    closeElements: PropTypes.func.isRequired,
    displayMode: PropTypes.string.isRequired,
    leftPanelWidth: PropTypes.number,
  };

  constructor(props) {
    super(props);
    this.document = React.createRef();
    this.container = React.createRef();
    this.wheelToNavigatePages = _.throttle(this.wheelToNavigatePages.bind(this), 300, { trailing: false });
    this.wheelToZoom = _.throttle(this.wheelToZoom.bind(this), 30, { trailing: false });
  }

  componentDidUpdate(prevProps) {
    if (isIE) {
      updateContainerWidth(prevProps, this.props, this.container.current);
    }
  }

  componentDidMount() {
    touchEventManager.initialize(this.document.current, this.container.current);
    core.setScrollViewElement(this.container.current);
    core.setViewerElement(this.document.current);

    this.loadInitialDocument();

    if (isIE) {
      window.addEventListener('resize', this.handleWindowResize);
    }

    if (process.env.NODE_ENV === 'development') {
      this.container.current.addEventListener('dragover', this.preventDefault);
      this.container.current.addEventListener('drop', this.onDrop);
    }

    this.container.current.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
  }

  componentWillUnmount() {
    touchEventManager.terminate();
    if (isIE) {
      window.removeEventListener('resize', this.handleWindowResize);
    }

    if (process.env.NODE_ENV === 'development') {
      this.container.current.addEventListener('dragover', this.preventDefault);
      this.container.current.removeEventListener('drop', this.onDrop);
    }

    this.container.current.removeEventListener('wheel', this.onWheel, { passive: false });
    window.removeEventListener('keydown', this.onKeyDown);
  }

  /* eslint-disable camelcase */
  loadInitialDocument = () => {
    const {
      initialDoc,
      documentId = null,
      auto_load = true,
      startOffline,
      filename,
      extension,
      useDownloader,
      streaming,
      azureWorkaround,
      encryption,
      pdftronServer,
      cacheKey = null,
      singleServerMode,
      forceClientSideInit,
      disableWebsockets,
    } = getWebViewerConstructorOptions();

    if ((initialDoc && auto_load) || startOffline) {
      const options = {
        docId: documentId,
        onProgress: console.log,
        onError: console.error,
        // workerTransportPromise
        // password
        filename,
        extension,
        useDownloader,
        streaming,
        azureWorkaround,
      };
      if (encryption) {
        options.xodOptions = {
          decrypt: window.CoreControls.Encryption.decrypt,
          decryptOptions: encryption,
        };
      }
      if (pdftronServer) {
        options.pdftronServer = {
          serverRoot: pdftronServer,
          cacheKey,
          singleServerMode,
          forceClientSideInit,
          disableWebsockets,
        };
      }
      window.docViewer.loadDocument(initialDoc, options);
    }
  };

  preventDefault = e => e.preventDefault();

  onDrop = e => {
    e.preventDefault();

    const { files } = e.dataTransfer;
    if (files.length) {
      window.docViewer.loadDocument(files[0]);
    }
  };

  onKeyDown = e => {
    const { currentPage, totalPages } = this.props;
    const { scrollTop, clientHeight, scrollHeight } = this.container.current;
    const reachedTop = scrollTop === 0;
    const reachedBottom = Math.abs(scrollTop + clientHeight - scrollHeight) <= 1;

    if ((e.key === 'ArrowUp' || e.which === 38) && reachedTop && currentPage > 1) {
      this.pageUp();
    } else if ((e.key === 'ArrowDown' || e.which === 40) && reachedBottom && currentPage < totalPages) {
      this.pageDown();
    }
  };

  handleWindowResize = () => {
    handleWindowResize(this.props, this.container.current);
  };

  onWheel = e => {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      this.wheelToZoom(e);
    } else if (!core.isContinuousDisplayMode()) {
      this.wheelToNavigatePages(e);
    }
  };

  wheelToNavigatePages = e => {
    const { currentPage, totalPages } = this.props;
    const { scrollTop, scrollHeight, clientHeight } = this.container.current;
    const reachedTop = scrollTop === 0;
    const reachedBottom = Math.abs(scrollTop + clientHeight - scrollHeight) <= 1;

    if (e.deltaY < 0 && reachedTop && currentPage > 1) {
      this.pageUp();
    } else if (e.deltaY > 0 && reachedBottom && currentPage < totalPages) {
      this.pageDown();
    }
  };

  pageUp = () => {
    const { currentPage, displayMode } = this.props;
    const { scrollHeight, clientHeight } = this.container.current;
    const newPage = currentPage - getNumberOfPagesToNavigate(displayMode);

    core.setCurrentPage(Math.max(newPage, 1));
    this.container.current.scrollTop = scrollHeight - clientHeight;
  };

  pageDown = () => {
    const { currentPage, displayMode, totalPages } = this.props;
    const newPage = currentPage + getNumberOfPagesToNavigate(displayMode);

    core.setCurrentPage(Math.min(newPage, totalPages));
  };

  wheelToZoom = e => {
    const currentZoomFactor = this.props.zoom;
    let newZoomFactor = currentZoomFactor;
    let multiple;

    if (e.deltaY < 0) {
      multiple = 1.25;
      newZoomFactor = Math.min(currentZoomFactor * multiple, getMaxZoomLevel());
    } else if (e.deltaY > 0) {
      multiple = 0.8;
      newZoomFactor = Math.max(currentZoomFactor * multiple, getMinZoomLevel());
    }

    core.zoomToMouse(newZoomFactor);
  };

  onTransitionEnd = () => {
    core.scrollViewUpdated();
  };

  handleScroll = () => {
    this.props.closeElements(['annotationPopup', 'textPopup']);
  };

  getClassName = props => {
    const { isLeftPanelOpen, isRightPanelOpen, isHeaderOpen, isSearchOverlayOpen } = props;

    return [
      'DocumentContainer',
      isLeftPanelOpen ? 'left-panel' : '',
      isRightPanelOpen ? 'right-panel' : '',
      isHeaderOpen ? '' : 'no-header',
      isSearchOverlayOpen ? 'search-overlay' : '',
    ]
      .join(' ')
      .trim();
  };

  render() {
    let className;

    if (isIE) {
      className = getClassNameInIE(this.props);
    } else {
      className = this.getClassName(this.props);
    }

    return (
      <div
        className={className}
        ref={this.container}
        data-element="documentContainer"
        onScroll={this.handleScroll}
        onTransitionEnd={this.onTransitionEnd}
      >
        <div className="document" ref={this.document}></div>
      </div>
    );
  }
}

const mapStateToProps = state => ({
  isLeftPanelOpen: selectors.isElementOpen(state, 'leftPanel'),
  isRightPanelOpen: selectors.isElementOpen(state, 'searchPanel'),
  isSearchOverlayOpen: selectors.isElementOpen(state, 'searchOverlay'),
  zoom: selectors.getZoom(state),
  currentPage: selectors.getCurrentPage(state),
  isHeaderOpen: selectors.isElementOpen(state, 'header') && !selectors.isElementDisabled(state, 'header'),
  displayMode: selectors.getDisplayMode(state),
  totalPages: selectors.getTotalPages(state),
  // using leftPanelWidth to trigger render
  leftPanelWidth: selectors.getLeftPanelWidth(state),
});

const mapDispatchToProps = dispatch => ({
  dispatch,
  openElement: dataElement => dispatch(actions.openElement(dataElement)),
  closeElements: dataElements => dispatch(actions.closeElements(dataElements)),
});

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(DocumentContainer);
