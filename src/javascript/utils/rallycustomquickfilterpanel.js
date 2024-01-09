Ext.define('Rally.ui.inlinefilter.CustomQuickFilterPanel', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.rallycustomquickfilterpanel',
    requires: [
        'Rally.ui.popover.FieldPopover',
        'Rally.ui.inlinefilter.FilterFieldFactory',
        'Rally.ui.inlinefilter.ToggleAdvancedButton',
        'Rally.ui.picker.ModelTypePicker',
        'Rally.data.ModelTypes',
        'Rally.data.wsapi.Filter',
        'Rally.data.wsapi.ModelBuilder',
        'Rally.util.DateTime',
        'Rally.util.Ref'
    ],
    mixins: [
        'Rally.clientmetrics.ClientMetricsRecordable'
    ],
    padding: '0 0 0 0',
    bodyPadding: '7px 5px 5px 5px',
    collapseDirection: 'top',
    border: false,
    stateful: true,
    cls: 'inline-filter-panel',
    layout: 'column',
    bubbleEvents: ['filterchange'],
    config: {
        autoExpand: false,
        model: undefined,
        context: undefined,
        matchType: 'AND',
        defaultFields: [],
        fields: [],
        initialTypes: [],
        initialFilters: [],
        toggleAdvancedButtonConfig: {},
        addQuickFilterConfig: {}
    },

    initComponent: function() {
        this.items = this._getItems();
        this.callParent(arguments);
    },

    getTypes: function() {
        var modelTypePicker = _.find(this.fields, {name: 'ModelType'});        
        return modelTypePicker ? modelTypePicker.getValue() : [];
    },

    getTypesFilter: function() {
        console.log('getTypesFilter');
        var types = this.getTypes(),
            filterIndex = _.findIndex(this.fields, {name: 'ModelType'}) + 1;

        return Ext.isEmpty(types) ? null :
            Ext.apply(Rally.data.wsapi.Filter.or(_.map(types, function(type) {
                var typeDefOid = this.model.getArtifactComponentModel(type).typeDefOid;
                return {
                    property: 'TypeDefOid',
                    operator: '=',
                    value: typeDefOid
                };
            }, this)), {
                filterIndex: filterIndex
            });
    },

    generateFilter: function(field, lastValue, index){
        var isRefUri = Rally.util.Ref.isRefUri(lastValue);
        var isRefOid = _.isNumber(Rally.util.Ref.getOidFromRef(lastValue));
        if (isRefUri && isRefOid && field.valueField === '_ref' && field.noEntryValue !== lastValue) {
            var record = field.getRecord();
            if (record) {
                var uuidRef = record.get('_uuidRef');
                if (uuidRef) {
                    lastValue = uuidRef;
                }
            }
        }

        var filter = _.isFunction(field.getFilter) ? field.getFilter() : Rally.data.wsapi.Filter.fromExtFilter({
            property: field.name,
            operator: field.operator,
            value: lastValue
        });

        if(filter) {

            if (field.allowNoEntry && field.noEntryValue === lastValue) {
                filter.value = null;
            }

            Ext.apply(filter, {
                name: field.name,
                rawValue: lastValue,
                filterIndex: index + 1
            });
            
            return filter;
        }
        return null;
    },

    getFilters: function() {
        
        var filters = [];
        _.each(this.fields, function(field, index) {
            if (field.name === 'ModelType') {
                return;
            }
            
            if (!Ext.isEmpty(field.lastValue) && !field.hasActiveError()) {
                if (Array.isArray(field.lastValue)){
                    var lastValues = field.lastValue;
                    var multipleSelectFilter = null;
                    for (var index = 0; index < lastValues.length; index++) {
                        var lastValue = lastValues[index];
                        var filter = this.generateFilter(field, lastValue, index);
                        if (filter){
                            if (multipleSelectFilter)
                                multipleSelectFilter = multipleSelectFilter.or(filter);
                            else
                                multipleSelectFilter = filter;
                        }
                    }
                    filters.push(multipleSelectFilter);
                }else{
                    var lastValue = field.lastValue;
                    var filter = this.generateFilter(field, lastValue, index);
                    if (filter);
                        filters.push(filter);
                }

                
            }
        }, this);        
        return filters;
    },

    clear: function() {
        _.each(this.fields, function(field) {
            field.originalValue = undefined;
            field.reset();
        }, this);
    },

    clearInvalidFields: function () {
        _.each(this.fields, function(field){
            if (!field.isValid()) {
                field.reset();
            }
        });
    },

    getSelectedFields: function() {
        return _.map(this.fields, 'name');
    },

    _getItems: function() {        
        this._createToggleAdvancedButton();
        this._createAddQuickFilterButton();
        
        return [].concat(this.addQuickFilterButton, this.toggleAdvancedButton);
    },

    _getOperatorForModelField: function(modelField) {
        var operator = '=';

        if (modelField && modelField.isCollection && modelField.isCollection()) {
            operator = 'contains';
        }

        return operator;
    },
    _createCustomField: function(filterIndex, field, initialValues, addtitionalConfig) {
        var fieldName = field.name || field,
            modelField = this.model.getField(fieldName),
            fieldConfig = Rally.ui.inlinefilter.FilterFieldFactory.getFieldConfig(this.model, fieldName, this.context),
            initialValue = initialValues && initialValues[fieldConfig.name] && initialValues[fieldConfig.name].rawValue;

        if (modelField && modelField.isDate() && initialValue) {
            initialValue = Rally.util.DateTime.fromIsoString(initialValue);
        }

        initialValue = Rally.ui.inlinefilter.FilterFieldFactory.getInitialValueForLegacyFilter(fieldConfig, initialValue);
        // fieldConfig = Rally.ui.inlinefilter.FilterFieldFactory.getFieldConfigForLegacyFilter(fieldConfig, initialValue);
        fieldConfig = {};

        Ext.applyIf(fieldConfig, {
            // allowClear: true
        });

        
        Ext.merge(fieldConfig, {
            xtype: 'rallycombobox',
            store: Ext.create('Ext.data.Store', {
                fields: ['abbr', 'name'],
                data : [
                    {"abbr":"Epic", "name":"Epic"},
                    {"abbr":"Feature", "name":"Feature"},
                ]
            }),
            name: 'PortfolioItemType.Name',
            queryMode: 'local',
            displayField: 'name',
            valueField: 'abbr',
            autoExpand: this.autoExpand,
            // clearText: '-- Clear Filter --',
            allowNoEntry: true,
            emptyText: 'Filter by PortfolioItem Type',
            labelAlign: 'right',
            labelWidth: 150,
            width: 450,
            labelSeparator: '',
            enableKeyEvents: true,
            hideLabel: false,
            margin: 0,
            cls: this.isCustomMatchType() ? 'indexed-field' : '',
            beforeLabelTextTpl: [
                '<span class="filter-index">{[this.getFilterIndex()]}</span>',
                {
                    filterIndex: filterIndex,
                    displayIndex: this.isCustomMatchType(),
                    getFilterIndex: function() {
                        return this.displayIndex ? Ext.String.format('({0}) ', this.filterIndex) : '';
                    }
                }
            ],
            context: this.context,
            operator: this._getOperatorForModelField(modelField),
        });
        Ext.merge(fieldConfig, addtitionalConfig);

        if (_.isPlainObject(field)) {
            Ext.apply(fieldConfig, field);
        }

        if (filterIndex === 1) {
            fieldConfig.itemId = this.self.FOCUS_CMP_ITEM_ID;
        }

        if (this._shouldApplyFiltersOnSelect(fieldConfig)) {
            Ext.merge(fieldConfig, {
                autoSelect: false,
                listeners: {
                    select: this._applyFilters,
                    scope: this
                }
            });
        } else {
            Ext.merge(fieldConfig, {
                listeners: {
                    change: this._applyFilters,
                    scope: this
                }
            });
        }       

        return Ext.widget(fieldConfig);
    },


    _createField: function(filterIndex, field, initialValues, addtitionalConfig) {
        var fieldName = field.name || field,
            modelField = this.model.getField(fieldName),
            fieldConfig = Rally.ui.inlinefilter.FilterFieldFactory.getFieldConfig(this.model, fieldName, this.context),
            initialValue = initialValues && initialValues[fieldConfig.name] && initialValues[fieldConfig.name].rawValue;

        if (modelField && modelField.isDate() && initialValue) {
            initialValue = Rally.util.DateTime.fromIsoString(initialValue);
        }

        initialValue = Rally.ui.inlinefilter.FilterFieldFactory.getInitialValueForLegacyFilter(fieldConfig, initialValue);
        fieldConfig = Rally.ui.inlinefilter.FilterFieldFactory.getFieldConfigForLegacyFilter(fieldConfig, initialValue);

        Ext.applyIf(fieldConfig, {
            allowClear: true
        });

        
        Ext.merge(fieldConfig, {
            autoExpand: this.autoExpand,
            allowBlank: true,
            clearText: '-- Clear Filter --',
            labelAlign: 'right',
            labelWidth: 150,
            width: 450,
            labelSeparator: '',
            enableKeyEvents: true,
            hideLabel: false,
            margin: 0,
            cls: this.isCustomMatchType() ? 'indexed-field' : '',
            beforeLabelTextTpl: [
                '<span class="filter-index">{[this.getFilterIndex()]}</span>',
                {
                    filterIndex: filterIndex,
                    displayIndex: this.isCustomMatchType(),
                    getFilterIndex: function() {
                        return this.displayIndex ? Ext.String.format('({0}) ', this.filterIndex) : '';
                    }
                }
            ],
            model: this.model,
            context: this.context,
            operator: this._getOperatorForModelField(modelField),            
        });
        Ext.merge(fieldConfig, addtitionalConfig);

        if (!_.isUndefined(initialValue)) {
            Ext.merge(fieldConfig, {
                value: initialValue
            });
        }

        if (_.isPlainObject(field)) {
            Ext.apply(fieldConfig, field);
        }

        if (filterIndex === 1) {
            fieldConfig.itemId = this.self.FOCUS_CMP_ITEM_ID;
        }

        if (this._shouldApplyFiltersOnSelect(fieldConfig)) {
            Ext.merge(fieldConfig, {
                autoSelect: true,
                listeners: {
                    select: this._applyFilters,
                    scope: this
                }
            });
        } else {
            Ext.merge(fieldConfig, {
                listeners: {
                    change: this._applyFilters,
                    scope: this
                }
            });
        }
        

        return Ext.widget(fieldConfig);
    },

    focusFirstField: function() {
        var focusCmp = _.first(this.fields);
        if (focusCmp) {
            focusCmp.focus(true);
        }
    },

    _removeQuickFilter: function(field) {
        this.recordAction({
            description: 'quick filter removed',
            miscData: {
                field: field.name || field
            }
        });
        var arrayIndex = field.beforeLabelTextTpl.filterIndex - 1;
        this.fields[arrayIndex].destroy();
        this.fields.splice(arrayIndex, 1);
        this.updateFilterIndices();
        this.fireEvent('quickfilterchange', field, this);
    },

    _shouldApplyFiltersOnSelect: function(fieldConfig) {
        var field = this.model.getField(fieldConfig.name),
            attributeDefinition = field && field.attributeDefinition;

        return attributeDefinition &&
            (attributeDefinition.Constrained || attributeDefinition.AttributeType === 'OBJECT') &&
            !fieldConfig.multiSelect;
    },

    _onMatchTypeChange: function(matchType) {
        this.updateFilterIndices(matchType.getValue());
    },

    isCustomMatchType: function() {
        return this.matchType === 'CUSTOM';
    },

    updateFilterIndices: function(matchType) {
        this.matchType = matchType || this.matchType;

        _.each(this.fields, function (field, index) {
            field.beforeLabelTextTpl.displayIndex = this.isCustomMatchType();
            field.beforeLabelTextTpl.filterIndex = index + 1;
            field.beforeLabelTextTpl.overwrite(field.labelEl.down('.filter-index'));
            if (this.isCustomMatchType()) {
                field.addCls('indexed-field');
            } else {
                field.removeCls('indexed-field');
            }
            if (Ext.isIE10m && field.inputEl) {
                field.setValue(field.getValue());
            }
        }, this);
    },

    _applyFilters: function() {
        console.log('_applyFilters');
        this.fireEvent('filterchange', this);
    },

    _createToggleAdvancedButton: function() {
        this.toggleAdvancedButton = Ext.widget(Ext.merge({
            xtype: 'rallytoggleadvancedbutton',
            listeners: {
                click: this._onToggleAdvanced,
                scope: this
            }
        }, this.toggleAdvancedButtonConfig));
    },

    _createAddQuickFilterButton: function() {
        var mileStoneFilterConfig = {
            width: 450,
            labelWidth: 150,
            fieldLabel: 'Milestone'
        };
        var stateFilterConfig = {
            width: 450,
            labelWidth: 150,
            fieldLabel: 'State',
            multiSelect: true,
        };
        var artifactFilterConfig = {
            width: 450,
            labelWidth: 150,
            fieldLabel: 'PortfolioItem Type',
        }

        var cboArtifact = this._createCustomField(0, 'PortfolioItemType', null, artifactFilterConfig);
        var cboMileStones = this._createField(1, 'Milestones', null, mileStoneFilterConfig);
        var cboState = this._createField(2, 'State', null, stateFilterConfig);
    
        this.addQuickFilterButton = Ext.widget({
            xtype: 'container',
            columnWidth: 0.8,
            layout:'vbox',
            height: '125px',
            flex: 1,
            items: [
                
               {
                    xtype: 'container',
                    flex: 1,
                    layout: 'hbox',
                    items: [
                        cboArtifact,
                        
                    ]
        
                },
                {
                    xtype: 'container',
                    flex: 1,
                    layout: 'hbox',
                    items: [
                        cboState,
                        {
                            xtype:'label',
                            text: 'Test Description',
                            padding: '0 0 0 20',
                            width: 200,
                            style: 'display:inline-block;text-align:center',
                            cls: 'bold-label',
                        },
                    ]
        
                },
                {
                    xtype: 'container',
                    layout: 'hbox',
                    flex: 1,
                    items:[
                        
                        cboMileStones,
                        // {
                        //     xtype: 'rallybutton',
                        //     enableToggle: true,
                        //     itemId: 'btBlocked',
                        //     margin: '6 6 6 185',
                        //     cls: 'primary rly-small',
                        //     iconCls: 'icon-blocked',
                        //     toolTipText: "Calculate time in Blocked state",
                            
                        // }, {
                        //     xtype: 'rallybutton',
                        //     enableToggle: true,
                        //     itemId: 'btReady',
                        //     margin: 6,
                        //     iconCls: 'icon-ok',
                        //     cls: 'primary rly-small',                            
                        //     toolTipText: "Calculate time in Ready state"
                            
                        // }
                    ]
                }
            ]
        });
        this.fields = [];
        this.fields.push(cboArtifact);
        this.fields.push(cboMileStones);
        this.fields.push(cboState);
    },

    _onToggleAdvanced: function() {
        this.fireEvent('toggleadvanced', this.toggleAdvancedButton);
    },

    _onAddQuickFilterClick: function() {
        var addQuickFilterConfig = Ext.clone(this.addQuickFilterConfig);
        var blackList =  _.map(this.fields, 'name');

        if (addQuickFilterConfig && addQuickFilterConfig.whiteListFields) {
            addQuickFilterConfig.whiteListFields = _.reject(this.addQuickFilterConfig.whiteListFields, function(field){
                return _.contains(blackList, field);
            });
        }
        this.addQuickFilterPopover = Ext.create('Rally.ui.popover.FieldPopover', {
            target: this.addQuickFilterButton.getEl(),
            placement: ['bottom', 'top', 'left', 'right'],
            fieldComboBoxConfig: _.merge({
                model: this.model,
                context: this.context,
                emptyText: 'Search filters...',
                additionalFields: [
                    {
                        name: 'ArtifactSearch',
                        displayName: 'Search'
                    },
                    {
                        name: 'ModelType',
                        displayName: 'Type'
                    }
                ],
                blackListFields: blackList,
                listeners: {
                    select: function(field, value) {
                        var fieldSelected = value[0].raw;
                        this.recordAction({
                            description: 'quick filter added',
                            miscData: {
                                field: fieldSelected.name || fieldSelected
                            }
                        });
                        this.addQuickFilterPopover.close();
                        this._onAddQuickFilterSelect(fieldSelected);
                    },
                    destroy: function(){
                        delete this.addQuickFilterPopover;
                    },
                    scope: this
                }
            }, addQuickFilterConfig, function(a, b) {
                if (_.isArray(a)) {
                    return a.concat(b);
                }
            })
        });
    },

    _onAddQuickFilterSelect: function(field) {
        var index = this.fields.length;
        var newItem = this._createField(index + 1, field);
        this.fields.push(newItem);
        this.insert(index, newItem);
        this.fireEvent('quickfilterchange', field, this);
    }

});