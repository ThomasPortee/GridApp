Ext.define('Rally.ui.gridboard.plugin.GridBoardCustomFilterControl', {
    alias: 'plugin.rallygridboardcustomfiltercontrol',
    extend:'Ext.AbstractPlugin',
    requires: [
        'Rally.ui.inlinefilter.CustomFilterControl'
    ],

    mixins: [
        'Rally.ui.gridboard.plugin.GridBoardControlShowable'
    ],

    headerPosition: 'left',
    sharedViewState: ['types', 'quickFilters', 'advancedFilters', 'matchType', 'condition', 'quickFilterFields'],

    config: {
        /**
         * @cfg {Object}
         * Config for Rally.ui.inlinefilter.InlineFilterButton.
         */
        inlineFilterButtonConfig: {},

        /**
         * @cfg {Object}
         * Config for Rally.ui.inlinefilter.ClearAsllButton.
         */
        clearAllButtonConfig: {}
    },

    init: function(cmp) {
        cmp.useFilterCollection = false;
        this.callParent(arguments);
        this.showControl();

        cmp.on('modeltypeschange', this._onModelTypesChange, this);
    },

    _updateContainerWidth: function(container){
        var cmp = this.cmp;
        if (container && container.rendered && cmp && cmp.rendered) {
            var gridBoardWidth = cmp.getWidth(),
                rightContainer = container.ownerCt.getRight().getWidth();

            container.setWidth(gridBoardWidth - rightContainer);
        }
    },

    _onModelTypesChange: function(cmp, newTypes) {
        var existingButton = this.getControlCmp(),
            container = existingButton.ownerCt,
            index = container.items.indexOf(existingButton),
            config = Ext.merge(this.getControlCmpConfig(), {
                modelNames: _.map(newTypes, function(t){ return t.get('TypePath'); })
            });

        Ext.suspendLayouts();
        this._updateContainerWidth(container);
        container.remove(existingButton, true);
        container.insert(index, config);
        Ext.resumeLayouts(true);
    },

    getControlCmpConfig: function() {
        return {
            xtype: 'rallycustomfiltercontrol',
            itemId: 'customilterControl',
            context: this.context || this.cmp.getContext(),
            inlineFilterButtonConfig: Ext.merge({
                listeners: {
                    inlinefilterchange: this._onFilterChange,
                    inlinefilterready: this._onFilterReady,
                    inlinefilterresize: this._onFilterResize,
                    scope: this
                }
            }, this.inlineFilterButtonConfig),
            clearAllButtonConfig: this.clearAllButtonConfig
        };
    },

    _onFilterResize: function(inlineFilterPanel, height, oldHeight) {
        this.cmp.suspendLayouts();
        if (height !== oldHeight) {
            this.cmp.setHeight();
        }
        this.cmp.resumeLayouts(false);
        this.cmp.updateLayout();
    },

    _onFilterReady: function(inlineFilterPanel) {
        this.cmp.insert(1, inlineFilterPanel);
    },

    _onFilterChange: function(inlineFilterButton) {
        this.cmp.applyCustomFilter(Ext.apply({
            recordMetrics: true
        }, inlineFilterButton.getTypesAndFilters()));
        inlineFilterButton.inlineFilterPanel.fireEvent('afterfilterchange');
    },

    getCurrentView: function() {
        return _.pick(this.getControlCmp().getComponent('customFilterButton').getState(), this.sharedViewState);
    },

    setCurrentView: function(view) {
        var inlineFilterButton = this.getControlCmp().getComponent('customFilterButton'),
            stateId = inlineFilterButton.getStateId(),
            state = _.pick(view, this.sharedViewState);

        Ext.apply(state, _.pick(inlineFilterButton.getState(), 'collapsed', 'advancedCollapsed'));
        Ext.state.Manager.set(stateId, state);
    },

    getCurrentFilters: function(){
        var inlineFilterButton = this.getControlCmp().getComponent('customFilterButton');
        return inlineFilterButton.getTypesAndFilters()['filters'];
    }
});