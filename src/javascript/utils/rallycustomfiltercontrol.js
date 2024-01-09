Ext.define('Rally.ui.inlinefilter.CustomFilterControl', {
        alias: 'widget.rallycustomfiltercontrol',
        extend: 'Ext.container.Container',
        requires: [
            'Rally.ui.inlinefilter.CustomFilterButton'
        ],

        cls: 'inline-filter-control',

        config: {
            context: undefined,

            /**
             * @cfg {Object}
             * Config for Rally.ui.inlinefilter.InlineFilterButton.
             */
            inlineFilterButtonConfig: {},

            /**
             * @cfg {Object}
             * Config for Rally.ui.inlinefilter.ClearAllButton.
             */
            clearAllButtonConfig: {}
        },

        constructor: function(config) {
            this.mergeConfig(config);
            this.callParent([this.config]);
        },

        initComponent: function() {
            this.items = this._getItems();
            this.callParent(arguments);
        },

        _getItems: function() {
            this._createInlineFilterButton();
            this._createClearAllButton();

            return [
                this.inlineFilterButton,
                this.clearAllButton
            ];
        },

        _createInlineFilterButton: function() {
            this.inlineFilterButton = Ext.widget(Ext.merge({
                xtype: 'rallycustomfilterbutton',
                itemId: 'customFilterButton',
                context: this.context,
                margin: '3 9 3 30'
            }, this.inlineFilterButtonConfig));
            this.inlineFilterButton.on('inlinefilterchange', this._onFilterChange, this);
        },

        _createClearAllButton: function() {
            this.clearAllButton = Ext.widget(Ext.merge({
                xtype: 'rallybutton',
                itemId: 'clearAllButton',
                cls: 'secondary rly-small clear-all-filters-button',
                text: 'Clear All',
                margin: '3 9 3 -11',
                hidden: !this._hasFilters(),
                listeners: {
                    click: this._onClearAllClick,
                    scope: this
                }
            }, this.clearAllButtonConfig));
        },

        _onClearAllClick: function() {
            this.inlineFilterButton.clearAllFilters();
        },

        _onFilterChange: function() {
            Ext.suspendLayouts();
            if (this._hasFilters()) {
                this.clearAllButton.show();
            } else {
                this.clearAllButton.hide();
            }
            Ext.resumeLayouts(false);
        },

        _hasFilters: function() {
            return !!this.inlineFilterButton.getFilterCount();
        },

        collapse: function() {
            this.inlineFilterButton.collapse();
        }
    });