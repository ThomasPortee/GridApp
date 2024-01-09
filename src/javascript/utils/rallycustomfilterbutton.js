
Ext.define('Rally.ui.inlinefilter.CustomFilterButton', {
    extend: 'Rally.ui.Button',
    alias: 'widget.rallycustomfilterbutton',
    requires: [
        'Ext.state.Manager',
        'Rally.data.ModelTypes',
        'Rally.data.ModelFactory',
        'Rally.data.wsapi.Filter',
        'Rally.data.wsapi.ModelBuilder',
        'Rally.data.wsapi.filter.FilterModificationator',        
        'Rally.ui.inlinefilter.CustomFilterConditionParser',
        'Rally.util.Ref'
    ],
    mixins: [
        'Rally.clientmetrics.ClientMetricsRecordable'
    ],

    cls: 'secondary rly-small',
    iconCls: 'icon-filter',
    bubbleEvents: ['viewstatesave'],
    stateEvents: ['expand', 'collapse', 'filterchange'],
    text: '',
    userAction: 'Filter button clicked',

    clientMetrics: [
        {
            endMethod: '_onModelLoadSuccess',
            description: 'inline filter button loaded'
        }
    ],

    config: {
        context: undefined,
        modelNames: undefined,
        filterChildren: false,
        inlineFilterPanelConfig: {
            quickFilterPanelConfig: {
                defaultFields: [],
                initialFilters: []
            },
            advancedFilterPanelConfig: {
                collapsed: true,
                advancedFilterRowsConfig: {
                    initialFilters: []
                }
            }
        },
        toolTipConfig: {
            anchor: 'top',
            mouseOffset: [-9, -2]
        },
        legacyStateIds: []
    },

    initComponent: function() {
        this.callParent(arguments);

        if (!this.stateful || (this.stateful && !this._hasState())) {
            this.applyState(this._transformLegacyFilters());
        }
        this.on('click', this._toggleFilterPanel, this, { buffer: 200 });
        this.on('filterchange', this._onFilterChange, this, { buffer: 500 });
        this.on('collapse', this._onCollapse, this);
    },

    afterRender: function() {
        this.callParent(arguments);
        this.toolTip.on('beforeshow', this._onBeforeShowToolTip, this);
    },

    getTypes: function() {
        var returnSelectedTypes = this._getMatchType() === 'AND',
            selectedTypes = this._getSelectedTypes(),
            configuredTypes = this._getConfiguredTypes();
        return selectedTypes.length && returnSelectedTypes ? selectedTypes : configuredTypes;
    },

    getFilters: function() {
        return this.inlineFilterPanel.getFilters();
    },

    /**
     * Get the active filters
     * @returns {Rally.data.wsapi.Filter}
     */
    getWsapiFilter: function() {
        var filters = _.each(this.getFilters(), this._escapeSpecialCharacters, this),
            matchType = this._getMatchType(),
            models = _.map(this.getTypes(), function(modelName) {
                return this.model.getArtifactComponentModel(modelName);
            }, this),
            modificationatedFilters = Rally.data.wsapi.filter.FilterModificationator.modifyFilters(filters, this.filterChildren, models);

        if (matchType === 'CUSTOM') {
            return this._getCustomWsapiFilter(_.map(modificationatedFilters, function(filter, index) {
                return Ext.apply(filter, {
                    filterIndex: filters[index].filterIndex
                });
            }));
        } else if (matchType === 'OR') {
            return this._getOredWsapiFilter(modificationatedFilters);
        } else {
            return Rally.data.wsapi.Filter.and(modificationatedFilters);
        }
    },

    getState: function() {
        if (this.inlineFilterPanel) {
            return {
                collapsed: this.inlineFilterPanel.getInlineCollapsed(),
                advancedCollapsed: this.inlineFilterPanel.getAdvancedCollapsed(),
                types: _.map(this.inlineFilterPanel.getTypes(), function(type) {
                    return this.model.getArtifactComponentModel(type).typeDefinition._refObjectUUID;
                }, this),
                quickFilters: this._mapFilterNamesToUuids(this.inlineFilterPanel.getQuickFilters()),
                advancedFilters: this._mapFilterNamesToUuids(this.inlineFilterPanel.getAdvancedFilters()),
                condition: this.inlineFilterPanel.getCustomFilterCondition(),
                matchType: this.inlineFilterPanel.getMatchType(),
                quickFilterFields: this._mapFieldNamesToUuids(this._getQuickFilterFields())
            };
        } else {
            return Ext.state.Manager.get(this.stateId);
        }
    },

    _transformLegacyFilter: function(filter) {
        var legacyFilter = Rally.data.wsapi.Filter.fromQueryString(filter);
        return {
            name: legacyFilter.property,
            operator: legacyFilter.operator.toLowerCase(),
            rawValue: legacyFilter.value
        };
    },

    _shouldBeQuickFilter: function(filter, quickFilters) {
        var quickFilterFields = this.inlineFilterPanelConfig.quickFilterPanelConfig.defaultFields;
        return filter.name === 'Owner' && filter.operator === '=' && _.contains(quickFilterFields, 'Owner') && !_.find(quickFilters, {name: 'Owner'});
    },

    _transformLegacyFilters: function() {
        var quickFilters = [],
            advancedFilters = [],
            types = [];

        _.each(this.legacyStateIds, function(stateId) {
            var state = Ext.state.Manager.get(stateId) || {},
                filters = [];

            if (state.filters) {
                filters = state.filters;
            }

            if(state.types && _.isUndefined(this.model)){
                types = state.types;
            }

            if (/owner-filter$/i.test(stateId) && state.value) {
                filters = [Ext.String.format('(Owner = {0})', state.value)];
            }

            _.each(filters || [], function (filter) {
                filter = this._transformLegacyFilter(filter);

                if (this._shouldBeQuickFilter(filter, quickFilters)) {
                    quickFilters.push(filter);
                } else {
                    advancedFilters.push(filter);
                }

            }, this);

        }, this);


        return {
            quickFilters: quickFilters,
            advancedFilters: advancedFilters,
            types: types
        };
    },

    applyState: function(state) {
        Ext.merge(this, this._transformStateToConfig(state));
        this._build(true);
    },

    saveState: function() {
        this.callParent(arguments);
        Ext.merge(this, this._transformStateToConfig(this.getState()));
    },

    onDestroy: function() {
        _.invoke(_.compact([
            this.relayedEvents,
            this.inlineFilterPanel
        ]), 'destroy');
        this.callParent(arguments);
    },

    clearAllFilters: function() {
        this.inlineFilterPanel.clear();
    },

    _getQuickFilterFields: function() {
        var quickFilterFields = this.inlineFilterPanel.getQuickFilterFields();

        if (_.isEqual(quickFilterFields, this.inlineFilterPanelConfig.quickFilterPanelConfig.defaultFields)) {
            return [];
        }

        return quickFilterFields;
    },

    _hasState: function(){
        if (this.stateful && this.stateId) {
            return !!Ext.state.Manager.get(this.stateId);
        }
        return false;
    },

    _escapeSpecialCharacters: function(filter){
        if (_.isObject(filter.property)) {
            this._escapeSpecialCharacters(filter.property);
        }

        if (_.isObject(filter.value)) {
            this._escapeSpecialCharacters(filter.value);
        }

        if (_.isString(filter.value)) {
            var specialCharacters = /"|\\/g;
            filter.value = filter.value.replace(specialCharacters, '\\$&');
        }
    },

    _getMatchType: function() {
        return this.inlineFilterPanel.getMatchType();
    },

    _isValidFilter: function(filter) {
        var fieldDef = this.model.getField(filter.name),
            attributeDef = fieldDef && fieldDef.attributeDefinition,
            attributeType = attributeDef && attributeDef.AttributeType;

        return attributeType !== 'OBJECT' || filter.rawValue === null || Rally.util.Ref.isRefUri(filter.rawValue);
    },

    _removeInvalidFilters: function(){
        var inlineFilterPanelConfig = this.inlineFilterPanelConfig,
            quickFilterPanelConfig = inlineFilterPanelConfig.quickFilterPanelConfig,
            quickFilters = quickFilterPanelConfig.initialFilters,
            advancedFilterPanelConfig = inlineFilterPanelConfig.advancedFilterPanelConfig,
            advancedFilterRowsConfig = advancedFilterPanelConfig.advancedFilterRowsConfig,
            advancedFilters = advancedFilterRowsConfig.initialFilters;

        quickFilterPanelConfig.initialFilters =  _.filter(quickFilters, this._isValidFilter, this);
        advancedFilterRowsConfig.initialFilters =  _.filter(advancedFilters, this._isValidFilter, this);
    },

    _build: function(applyFilters) {
        return this._loadModel().then({
            success: _.partial(this._onModelLoadSuccess, applyFilters),
            scope: this
        });
    },

    _onModelLoadSuccess: function(applyFilters) {
        this._mapUuidsToNames();
        this._removeInvalidFilters();
        this._createInlineFilterPanel();

        if (applyFilters) {
            this._applyFilters();
        }
    },

    _loadModel: function() {
        if (this.model) {
            return Deft.Promise.when(this.model);
        } else {
            return Rally.data.ModelFactory.getModels({
                context: this.context || Rally.environment.getContext(),
                types: this.modelNames
            }).then({
                success: function(models) {
                    this.model = Rally.data.wsapi.ModelBuilder.buildCompositeArtifact(_.values(models), this.context);
                },
                scope: this
            });
        }
    },

    _mapUuidsToNames: function() {
        this.inlineFilterPanelConfig.quickFilterPanelConfig.initialTypes = _.map(this.inlineFilterPanelConfig.quickFilterPanelConfig.initialTypes, function(type) {
            var model =_.find(this.model.getArtifactComponentModels(), function(model) {
                return model.typePath === type || model.typeDefinition._refObjectUUID === type;
            });
            return model && model.typePath;
        }, this);

        this.inlineFilterPanelConfig.quickFilterPanelConfig.initialFilters = this._mapFilterUuidsToNames(this.inlineFilterPanelConfig.quickFilterPanelConfig.initialFilters);
        this.inlineFilterPanelConfig.quickFilterPanelConfig.fields = this._mapFieldUuidsToNames(this.inlineFilterPanelConfig.quickFilterPanelConfig.fields);
        this.inlineFilterPanelConfig.advancedFilterPanelConfig.advancedFilterRowsConfig.initialFilters = this._mapFilterUuidsToNames(this.inlineFilterPanelConfig.advancedFilterPanelConfig.advancedFilterRowsConfig.initialFilters);
    },

    _mapFilterUuidsToNames: function(filters) {
        var fieldsByUuid = this._getFieldsByUuid();

        return _.map(filters, function(filter) {
            return Ext.apply(filter, {
                name: (fieldsByUuid[filter.name] || filter).name
            });
        });
    },

    _mapFieldUuidsToNames: function(fieldNames) {
        var fieldsByUuid = this._getFieldsByUuid();

        var fields = _.map(fieldNames, function(fieldName) {
            return (fieldsByUuid[fieldName] && fieldsByUuid[fieldName].name) || fieldName;
        });

        return _.reject(fields, function(fieldName){
            return Rally.util.RegularExpression.uuidOrOidRegularExpression.test(fieldName);
        });
    },

    _getFieldsByUuid: function() {
        return _.indexBy(_.filter(this.model.getFields(), function(field) {
            return !!field.attributeDefinition;
        }), function(field) {
            return field.attributeDefinition._refObjectUUID;
        });
    },

    _mapFilterNamesToUuids: function(filters) {
        return _.map(filters, function(filter) {

            var newFilter = {
                name: this._getFilterFieldUuid(filter.name),
                operator: filter.operator,
                rawValue: filter.rawValue
            };

            return newFilter;
        }, this);
    },

    _mapFieldNamesToUuids: function(fieldNames) {
        return _.map(fieldNames, this._getFilterFieldUuid, this);
    },

    _getFilterFieldUuid: function(fieldName) {
        var field = this.model.getField(fieldName);
        return (field && field.attributeDefinition && field.attributeDefinition._refObjectUUID) || fieldName;
    },

    _createInlineFilterPanel: function() {
        this.inlineFilterPanel = Ext.widget(Ext.merge({
            xtype: 'rallycustomfilterpanel',
            itemId: 'customFilterPanel',
            anchorTargetCmp: this,
            model: this.model,
            context: this.context
        }, this.inlineFilterPanelConfig));

        this.relayedEvents = this.relayEvents(this.inlineFilterPanel, ['expand', 'collapse', 'inlinefilterresize', 'filterchange']);
        this.fireEvent('inlinefilterready', this.inlineFilterPanel);
    },

    _toggleFilterPanel: function() {
        this.inlineFilterPanel.toggleCollapse();
    },

    getTypesAndFilters: function(){
        return {
            types: this.getTypes(),
            filters: _.compact([this.getWsapiFilter()])
        };
    },

    _typesOrFiltersChanged: function(){
        var previousTypesAndFilters = this._previousTypesAndFilters,
            currentTypesAndFilters = this.getTypesAndFilters(),
            previousTypes = previousTypesAndFilters.types.toString(),
            previousFilters = previousTypesAndFilters.filters.toString(),
            currentTypes = currentTypesAndFilters.types.toString(),
            currentFilters = currentTypesAndFilters.filters.toString();
        return previousTypes !== currentTypes || previousFilters !== currentFilters;
    },

    _onFilterChange: function() {
        if (this._typesOrFiltersChanged()) {
            this._recordMetrics();
            this._applyFilters();
        }
        this.fireEvent('viewstatesave', this);
    },

    _recordMetrics: function() {
        this.recordAction({
            component: this,
            description: 'Filters changed',
            miscData: {
                quickFilters: _.pluck(this.inlineFilterPanel.getQuickFilters(), 'name'),
                advancedFilters: _.pluck(this.inlineFilterPanel.getAdvancedFilters(), 'name'),
                types: this._getSelectedTypes(),
                customCondition: this.inlineFilterPanel.getCustomFilterCondition(),
                matchType: this._getMatchType(),
                quickFilterFields: this._getQuickFilterFields()
            }
        });
    },

    _applyFilters: function() {
        this._updateCount();
        this.fireEvent('inlinefilterchange', this);
        this._previousTypesAndFilters = this.getTypesAndFilters();
    },

    _getSelectedTypes: function() {
        return this.inlineFilterPanel.getTypes();
    },

    _getConfiguredTypes: function() {
        return _.map(this.modelNames, function(modelName) {
            return Rally.data.ModelTypes.getTypeByName(modelName).toLowerCase();
        });
    },

    _transformStateToConfig: function(state) {
        var config = {
            inlineFilterPanelConfig: {
                collapsed: state.collapsed,
                quickFilterPanelConfig: {
                    matchType: state.matchType,
                    initialTypes: state.types,
                    initialFilters: state.quickFilters,
                    fields: state.quickFilterFields
                },
                advancedFilterPanelConfig: {
                    collapsed: state.advancedCollapsed,
                    advancedFilterRowsConfig: {
                        matchType: state.matchType,
                        initialFilters: state.advancedFilters
                    },
                    customFilterConditionConfig: {
                        value: state.condition,
                        validator: Ext.bind(this._validateCustomFilterCondition, this)
                    },
                    matchTypeConfig: {
                        value: state.matchType
                    }
                }
            }
        };

        // because state always wins, and we don't want to overwrite defaults with an undefined
        return this._removeUndefined(config);
    },

    _removeUndefined: function(obj) {
        return _.reduce(obj, function(result, value, key) {
            if (_.isPlainObject(value)) {
                result[key] = this._removeUndefined(value);
            } else if (Ext.isDefined(value)) {
                result[key] = value;
            }
            return result;
        }, {}, this);
    },

    _updateCount: function() {
        var filterCount = this.getFilterCount();

        Ext.suspendLayouts();
        if (filterCount > 0) {
            this.setText(Ext.String.format('{0} Filter{1} Active', filterCount, filterCount > 1 ? 's' : ''));
            this._indicateActiveFilterPresent();
        } else {
            this.setText('');
            this._indicateNoActiveFilterPresent();
        }
        Ext.resumeLayouts(false);
    },

    getFilterCount: function() {
        if(!this.inlineFilterPanel){
            return 0;
        }

        var matchType = this._getMatchType(),
            filterCount = 0;

        if (matchType !== 'CUSTOM') {
            var filters = this.getFilters(),
                types = this._getSelectedTypes();
            filterCount = filters.length + (types.length ? 1 : 0);
        } else if (this.inlineFilterPanel.validateCustomFilterCondition()) {
            var condition = this.inlineFilterPanel.getCustomFilterCondition(),
                indices = condition.match(/\d+/g);
            filterCount = _.unique(indices).length;
        }
        return filterCount;
    },

    _indicateActiveFilterPresent: function() {
        if (!this.hasCls('primary')) {
            this.addCls('primary');
            this.removeCls('secondary');
        }
    },

    _indicateNoActiveFilterPresent: function() {
        if (!this.hasCls('secondary')) {
            this.addCls('secondary');
            this.removeCls('primary');
        }
    },

    _getTypesFilter: function() {
        return this.inlineFilterPanel.getTypesFilter();
    },

    _getOredWsapiFilter: function(filters) {
        var filter = Rally.data.wsapi.Filter.or(filters),
            typesFilter = this._getTypesFilter();

        return (filter && typesFilter && filter.or(typesFilter)) || filter || typesFilter;
    },

    _getCustomWsapiFilter: function(filters) {
        return this._getParsedCustomFilterCondition(filters, this.inlineFilterPanel.getCustomFilterCondition()).filter;
    },

    _validateCustomFilterCondition: function(value) {
        var parsed = this._getParsedCustomFilterCondition(this.getFilters(), value);
        return parsed.isValid || parsed.errorMessages.join('\n');
    },

    _getParsedCustomFilterCondition: function(filters, customFilterCondition) {
        var typeFilter = this._getTypesFilter(),
            filterMap = _.indexBy(_.compact(filters.concat([typeFilter])), 'filterIndex');
        return Rally.ui.inlinefilter.CustomFilterConditionParser.parse(customFilterCondition, filterMap);
    },

    _onCollapse: function() {
        _.forEach(this.inlineFilterPanel.query('field'), function (field) {
            if (field.validationCmp) {
                field.validationCmp.hide();
            }
        });
    },

    collapse: function() {
        this.inlineFilterPanel.collapse();
    },

    _onBeforeShowToolTip: function() {
        var action = this.inlineFilterPanel.collapsed ? 'Show' : 'Hide';
        this.toolTip.update(Ext.String.format('{0} Custom Filters', action));
    }
});