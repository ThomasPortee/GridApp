Ext.define('Rally.ui.inlinefilter.CustomFilterPanel', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.rallycustomfilterpanel',
    requires: [
        'Ext.TaskManager',
        'Rally.ui.Button',
        'Rally.ui.inlinefilter.QuickFilterPanel',
        'Rally.ui.inlinefilter.AdvancedFilterPanel'
    ],

    cls: 'inline-filter-panel',
    header: false,
    minHeight: 46,
    padding: '8px 0 0 0',
    bodyPadding: '7px 5px 5px 5px',
    collapseDirection: 'top',
    collapsible: true,
    animCollapse: false,

    config: {
        inline: true,
        collapsed: true,
        anchorTargetCmp: undefined,
        model: undefined,
        context: undefined,
        quickFilterPanelConfig: {
            initialFilters: []
        },
        advancedFilterPanelConfig: {
            advancedFilterRowsConfig: {},
            matchTypeConfig: {
                value: 'AND'
            }
        }
    },

    clientMetrics: [
        {
            event: 'expand',
            description: 'Inline filter panel expanded'
        },
        {
            event: 'collapse',
            description: 'Inline filter panel collapsed'
        }
    ],

    constructor: function(config) {
        this.mergeConfig(config);
        this.callParent([this.config]);
    },

    initComponent: function() {
        this.items = this._getItems();
        this.on('expand', this._onExpand, this);
        this.on('beforecollapse', this._onBeforeCollapse, this);
        this.callParent(arguments);
    },

    getInlineCollapsed: function() {
        return !!this.collapsed;
    },

    getAdvancedCollapsed: function() {
        return !!this.advancedFilterPanel.collapsed;
    },

    getTypes: function() {
        return this.quickFilterPanel.getTypes();
    },

    getTypesFilter: function() {
        return this.quickFilterPanel.getTypesFilter();
    },

    getFilters: function() {
        // console.log('getQuickFilters', this.getQuickFilters());
        return [].concat(this.getQuickFilters()).concat(this.getAdvancedFilters());
    },

    getQuickFilters: function() {
        return this.quickFilterPanel.getFilters();
    },

    getQuickFilterFields: function() {
        return this.quickFilterPanel.getSelectedFields();
    },

    getAdvancedFilters: function() {
        return this.advancedFilterPanel.getFilters();
    },

    getCustomFilterCondition: function() {
        return this.advancedFilterPanel.getCustomFilterCondition();
    },

    getMatchType: function() {
        return this.advancedFilterPanel.getMatchType();
    },

    onDestroy: function() {
        _.invoke(_.compact([
            this.chevronAligner,
            this.toggleAdvancedButtonRelayedEvents
        ]), 'destroy');
        this.callParent(arguments);
    },

    onResize: function(width, height, oldWidth, oldHeight) {
        this.callParent(arguments);
        this._alignChevron();
        this.fireEvent('inlinefilterresize', this, height, oldHeight);
    },

    afterRender: function() {
        this.callParent(arguments);
        this.on('afterfilterchange', this._alignChevron, this);
    },

    validateCustomFilterCondition: function() {
        return this.advancedFilterPanel.validateCustomFilterCondition();
    },

    _onExpand: function(cmp) {
        if (cmp === this) {
            this.quickFilterPanel.focusFirstField();
        }
    },

    _onBeforeCollapse: function(cmp) {
        this._removeInvalidFilters();
        if (Ext.isIE10m && cmp === this) {
            this.focus();
        }
    },

    _removeInvalidFilters: function() {
        this.advancedFilterPanel.removeInvalidRows();
        this.quickFilterPanel.clearInvalidFields();
    },

    _getItems: function() {
        this._createCloseButton();
        this._createQuickFilterPanel();
        this._createAdvancedFilterPanel();
        this.toggleAdvancedButtonRelayedEvents = this.quickFilterPanel.toggleAdvancedButton.relayEvents(this.advancedFilterPanel, ['collapse', 'expand', 'filterchange'], 'advanced');

        return [
            this.closeButton,
            this.quickFilterPanel,
            this.advancedFilterPanel
        ];
    },

    _createCloseButton: function() {
        this.closeButton = Ext.widget({
            xtype: 'rallybutton',
            cls: 'inline-filter-panel-close icon-cross',
            height: 18,
            userAction: 'Close (X) filter panel clicked',
            listeners: {
                click: function() {
                    this.collapse();
                },
                scope: this
            }
        });
    },

    _createQuickFilterPanel: function() {
        this.quickFilterPanel = Ext.widget(Ext.merge({
            xtype: 'rallycustomquickfilterpanel',
            autoExpand: !Ext.isIE,
            model: this.model,
            context: this.context,
            toggleAdvancedButtonConfig: {
                advancedCollapsed: this.advancedFilterPanelConfig.collapsed
            },
            listeners: {
                toggleadvanced: this._onToggleAdvanced,
                quickfilterchange: this._onQuickFilterChange,
                scope: this
            }
        }, this.quickFilterPanelConfig));
    },

    _createAdvancedFilterPanel: function() {
        var filterStartIndex = this._getFilterStartIndex(),
            matchTypeConfig = this.advancedFilterPanelConfig.matchTypeConfig,
            isMatchTypeCustom = matchTypeConfig.value === 'CUSTOM';

        this.advancedFilterPanel = Ext.widget(Ext.merge({
            xtype: 'rallyadvancedfilterpanel',
            customFilterConditionConfig: {
                hidden: !isMatchTypeCustom,
                maxWidth: 753,
                width: '50%',
                padding: '0 0 0 47px'
            },
            advancedFilterRowsConfig: {
                autoExpand: !Ext.isIE,
                model: this.model,
                context: this.context,
                filterStartIndex: filterStartIndex,
                maxWidth: 800,
                width: '50%',
                padding: 0
            },
            matchTypeConfig: {
                autoExpand: !Ext.isIE
            },
            listeners: {
                matchtypechange: this._onMatchTypeChange,
                scope: this
            }
        }, this.advancedFilterPanelConfig));
    },

    _getFilterStartIndex: function() {
        return this.quickFilterPanel.fields.length + 1;
    },

    _onToggleAdvanced: function(button) {
        this.advancedFilterPanel.toggleCollapse();
        if (Ext.isIE || Ext.isGecko) {
            button.focus();
        }
    },

    _alignChevron: function() {
        this._ensureChevron();
        if (!this.collapsed && this.anchorTargetCmp.el) {
            this.chevron.alignTo(this.anchorTargetCmp.el, 't-b', [0, 4]);
            this.chevron.show();
            this.chevronAligner.start();
        } else {
            this.chevron.hide();
            this.chevronAligner.stop();
        }
    },

    _ensureChevron: function() {
        if (!this.chevron && this.el) {
            this.chevron = this.el.createChild({
                cls: 'chevron-up inline-filter-chevron'
            });

            this.chevronAligner = Ext.TaskManager.newTask({
                run: function() {
                    if (!this.collapsed && this.anchorTargetCmp.el) {
                        var x = this.anchorTargetCmp.el.getX();
                        if (x !== this.lastX) {
                            this.lastX = x;
                            this._alignChevron();
                        }
                    }
                },
                scope: this,
                interval: 250
            });
        }
    },

    _onMatchTypeChange: function(matchType) {
        this.quickFilterPanel.updateFilterIndices(matchType.getValue());
    },

    clear: function() {
        this.suspendEvents(false);
        this.suspendLayouts();
        this.quickFilterPanel.clear();
        this.advancedFilterPanel.clear();
        this.resumeEvents();
        this.resumeLayouts(false);
        this.updateLayout();
        this.fireEvent('filterchange', this);
    },

    _onQuickFilterChange: function() {
        this.quickFilterPanel.updateFilterIndices();
        this.advancedFilterPanel.updateFilterIndices(this._getFilterStartIndex());
        this.fireEvent('filterchange', this);
    }
});